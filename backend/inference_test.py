from torchvision import transforms
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader
import torch
import torch.nn as nn
from models.resnet18 import *
from PIL import Image


BATCH_SIZE = 1

def scan_32_x_32_grid(tensor):
    pass

def main():
    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    test_transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Resize((32,32)),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
    rn18_weights = r"C:\github\DatathonxAI\backend\checkpoint\best_model_rn18.pth"

    test_set = ImageFolder(r"C:\github\DatathonxAI\backend\images", transform=test_transform)

    test_loader = DataLoader(test_set, batch_size=BATCH_SIZE,num_workers=0,pin_memory=True,shuffle=False)

    model = resnet18(rn18_weights, device)

    total_accuracy = 0
    trials = len(test_set)//BATCH_SIZE


    for image, label in test_loader:
        image = image.to(device)
        label = label.to(device)

        logits = model(image)
        prob = torch.softmax(logits, dim=1)
        predicted_class = torch.argmax(prob,dim=1)
        
        correct = (predicted_class==label).sum().item()

        total_accuracy += correct

    print(f'Final testing accuracy: {total_accuracy/trials:.2f}%')


if __name__ == "__main__":
    main()