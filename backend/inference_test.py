from torchvision import transforms
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader
import torch.nn as nn
import torch
from resnet18 import *
from PIL import Image


def main():
    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    test_transform = transforms.compose([
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])

    test_set = ImageFolder("C:\github\dataset\archive\test", transforms=test_transform)

    test_loader = DataLoader(test_set, batch_size=32,num_workers=4,pin_memory=True,shuffle=False)

    model = resnet18()

    for image, label in test_loader:
        image = image.to(device)
        label = label.to(device)
        model = model.to(device)
        logits = model(image)
        prob = nn.softmax(logits)
