import copy
import time

import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.init as init
from torchvision import datasets, transforms
from torch.utils.data import DataLoader, random_split


# -----------------------------
# CONFIG
# -----------------------------
BATCH_SIZE = 128
MAX_EPOCH = 160
PATIENCE = 5
MIN_DELTA = 0.001
BEST_MODEL_PATH = "model/best_resnet20.pth"
VALIDATION_SPLIT = 0.1
RANDOM_SEED = 42

use_gpu = torch.cuda.is_available()
device = torch.device("cuda" if use_gpu else "cpu")


# -----------------------------
# PREPROCESS THE IMAGES
# -----------------------------
train_transform = transforms.Compose([
    transforms.Pad(4),
    transforms.RandomHorizontalFlip(),
    transforms.RandomCrop(size=32),
    transforms.ToTensor(),
    transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5)),
])

test_transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5)),
])


class ResBlock(nn.Module):
    """The block of residual network."""

    def __init__(self, in_channel, out_channel, size):
        super(ResBlock, self).__init__()
        self.in_channel = in_channel
        self.out_channel = out_channel
        self.size = size
        self.conv1 = nn.Conv2d(in_channel, out_channel, (3, 3), padding=1)
        self.conv1_ = nn.Conv2d(in_channel, out_channel, (3, 3), stride=2, padding=1)
        self.conv2 = nn.Conv2d(out_channel, out_channel, (3, 3), padding=1)
        self.bn = nn.BatchNorm2d(out_channel)
        self.relu = nn.PReLU()
        self.max_pool = nn.MaxPool2d(2, 2)

    def forward(self, input):
        identity = input

        # If channels and image size do not change after the block.
        if self.in_channel == self.out_channel:
            output = self.conv1(input)
            output = self.bn(output)
            output = self.relu(output)
            output = self.conv2(output)
            output = self.bn(output)
            output = torch.add(output, identity)
            output = self.relu(output)
        else:
            # If channels and image size change after the block.
            identity = self.max_pool(identity)

            # Keep the zero padding on the same device as identity.
            zeros = torch.zeros_like(identity)
            identity = torch.cat((identity, zeros), dim=1)

            output = self.conv1_(input)
            output = self.bn(output)
            output = self.relu(output)
            output = self.conv2(output)
            output = self.bn(output)
            output = torch.add(output, identity)
            output = self.relu(output)

        return output


class ResNet(nn.Module):
    """The architecture of residual network."""

    def __init__(self):
        super(ResNet, self).__init__()
        self.relu = nn.PReLU()
        self.bn1 = nn.BatchNorm2d(16)
        self.conv1 = nn.Conv2d(3, 16, (3, 3), padding=1)
        self.res_block1 = ResBlock(16, 16, 32)
        self.res_block2 = ResBlock(16, 16, 32)
        self.res_block3 = ResBlock(16, 16, 32)
        self.res_block4 = ResBlock(16, 32, 32)
        self.res_block5 = ResBlock(32, 32, 16)
        self.res_block6 = ResBlock(32, 32, 16)
        self.res_block7 = ResBlock(32, 64, 16)
        self.res_block8 = ResBlock(64, 64, 8)
        self.res_block9 = ResBlock(64, 64, 8)
        self.global_pool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Linear(64, 2)
        self.init_params()

    def init_params(self):
        """Initialize the parameters in the ResNet model."""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                init.kaiming_normal_(m.weight, mode="fan_out")
                if m.bias is not None:
                    init.constant_(m.bias, 0)
            if isinstance(m, nn.BatchNorm2d):
                init.constant_(m.weight, 1)
                init.constant_(m.bias, 0)
            if isinstance(m, nn.Linear):
                init.normal_(m.weight, std=0.01)
                if m.bias is not None:
                    init.constant_(m.bias, 0)

    def forward(self, input):
        output = self.conv1(input)
        output = self.bn1(output)
        output = self.relu(output)
        output = self.res_block1(output)
        output = self.res_block2(output)
        output = self.res_block3(output)
        output = self.res_block4(output)
        output = self.res_block5(output)
        output = self.res_block6(output)
        output = self.res_block7(output)
        output = self.res_block8(output)
        output = self.res_block9(output)
        output = self.global_pool(output)
        output = output.view(-1, 64)
        output = self.fc(output)

        # Do not apply softmax here.
        # CrossEntropyLoss expects raw logits.
        return output


def lr_optimizer(optimizer, step):
    """Learning rate schedule.

    When step is 32000 or 48000, divide the learning rate by 10.
    """
    if step == 32000:
        for param_group in optimizer.param_groups:
            param_group["lr"] = param_group["lr"] / 10
        print("Learning rate is set to {:.6f}".format(optimizer.param_groups[0]["lr"]))
    elif step == 48000:
        for param_group in optimizer.param_groups:
            param_group["lr"] = param_group["lr"] / 10
        print("Learning rate is set to {:.6f}".format(optimizer.param_groups[0]["lr"]))
    return optimizer


def evaluate(res_net, criterion, data_loader):
    """Evaluate model loss and accuracy."""
    res_net.eval()

    running_loss = 0.0
    corrects = 0
    total = 0

    with torch.no_grad():
        for inputs, labels in data_loader:
            inputs = inputs.to(device)
            labels = labels.to(device)

            outputs = res_net(inputs)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * inputs.size(0)

            _, preds = torch.max(outputs, 1)
            corrects += torch.sum(preds == labels).item()
            total += labels.size(0)

    avg_loss = running_loss / total
    accuracy = corrects / total

    return avg_loss, accuracy


def train(
    res_net,
    lr_optimizer,
    optimizer,
    criterion,
    train_loader,
    val_loader,
    max_epoch=160,
    patience=10,
    min_delta=0.0,
    save_path="model/best_resnet20.pth",
):
    """Train the ResNet model with early stopping based on validation loss."""
    step = 0
    start_time = time.time()

    best_val_loss = float("inf")
    best_epoch = 0
    patience_counter = 0
    best_state_dict = copy.deepcopy(res_net.state_dict())

    for epoch in range(max_epoch):
        res_net.train()

        running_loss = 0.0
        corrects = 0
        total = 0

        for train_input, train_label in train_loader:
            step += 1

            train_input = train_input.to(device)
            train_label = train_label.to(device)

            optimizer = lr_optimizer(optimizer, step)
            optimizer.zero_grad()

            train_outputs = res_net(train_input)
            loss = criterion(train_outputs, train_label)

            loss.backward()
            optimizer.step()

            running_loss += loss.item() * train_input.size(0)

            _, preds = torch.max(train_outputs, 1)
            corrects += torch.sum(preds == train_label).item()
            total += train_label.size(0)

            if step % 10 == 0:
                end_time = time.time()
                duration = end_time - start_time
                start_time = time.time()
                print(
                    "Step: {}, Loss: {:.4f}, Duration per 10 steps: {:.2f}".format(
                        step,
                        loss.item(),
                        duration,
                    )
                )

        train_loss = running_loss / total
        train_acc = corrects / total

        val_loss, val_acc = evaluate(res_net, criterion, val_loader)

        print(
            "Epoch: {} | Train Loss: {:.4f} | Train Acc: {:.4f} | Val Loss: {:.4f} | Val Acc: {:.4f}".format(
                epoch + 1,
                train_loss,
                train_acc,
                val_loss,
                val_acc,
            )
        )

        # -----------------------------
        # EARLY STOPPING CHECK
        # -----------------------------
        if val_loss < best_val_loss - min_delta:
            best_val_loss = val_loss
            best_epoch = epoch + 1
            patience_counter = 0
            best_state_dict = copy.deepcopy(res_net.state_dict())
            torch.save(best_state_dict, save_path)
            print("Validation loss improved. Saved best model at epoch {}.".format(best_epoch))
        else:
            patience_counter += 1
            print("Validation loss did not improve. Patience: {}/{}".format(patience_counter, patience))

            if patience_counter >= patience:
                print(
                    "Early stopping triggered at epoch {}. Best epoch was {} with val loss {:.4f}.".format(
                        epoch + 1,
                        best_epoch,
                        best_val_loss,
                    )
                )
                break

    res_net.load_state_dict(best_state_dict)
    return res_net


def main():
    torch.manual_seed(RANDOM_SEED)
    if use_gpu:
        torch.cuda.manual_seed_all(RANDOM_SEED)

    # -----------------------------
    # MAKE DATALOADERS
    # -----------------------------
    full_train_data = datasets.ImageFolder(
        root=r"C:\github\dataset\archive\train",
        transform=train_transform,
    )

    test_data = datasets.ImageFolder(
        root=r"C:\github\dataset\archive\test",
        transform=test_transform,
    )

    val_size = int(len(full_train_data) * VALIDATION_SPLIT)
    train_size = len(full_train_data) - val_size

    generator = torch.Generator().manual_seed(RANDOM_SEED)
    train_data, val_data = random_split(full_train_data, [train_size, val_size], generator=generator)

    train_loader = DataLoader(
        dataset=train_data,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=2,
    )

    val_loader = DataLoader(
        dataset=val_data,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=2,
    )

    test_loader = DataLoader(
        dataset=test_data,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=2,
    )

    # -----------------------------
    # MODEL, LOSS, OPTIMIZER
    # -----------------------------
    res_net = ResNet().to(device)
    criterion = nn.CrossEntropyLoss()

    # The parameters of PReLU do not have weight decay.
    optimizer = optim.SGD([
        {"params": res_net.bn1.parameters(), "weight_decay": 0.0001},
        {"params": res_net.conv1.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block1.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block2.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block3.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block4.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block5.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block6.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block7.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block8.parameters(), "weight_decay": 0.0001},
        {"params": res_net.res_block9.parameters(), "weight_decay": 0.0001},
        {"params": res_net.relu.parameters()},
    ], lr=0.1, momentum=0.9)

    # -----------------------------
    # TRAIN WITH EARLY STOPPING
    # -----------------------------
    res_net = train(
        res_net=res_net,
        lr_optimizer=lr_optimizer,
        optimizer=optimizer,
        criterion=criterion,
        train_loader=train_loader,
        val_loader=val_loader,
        max_epoch=MAX_EPOCH,
        patience=PATIENCE,
        min_delta=MIN_DELTA,
        save_path=BEST_MODEL_PATH,
    )

    # -----------------------------
    # FINAL TEST ACCURACY
    # -----------------------------
    test_loss, test_acc = evaluate(res_net, criterion, test_loader)
    print("Test Loss: {:.4f}".format(test_loss))
    print("The accuracy in the test dataset is {:.4f}".format(test_acc))


if __name__ == "__main__":
    main()
