from torchvision import transforms
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader
import torch
from models.resnet18 import *
import numpy as np


BATCH_SIZE = 1

def scan_grid(tensor,stride=16,grid_size=32):
    W, H = tensor.shape[2],tensor.shape[3]
    tensor = tensor.squeeze(0)
    stacked_grid = []
    for i in range(0,W-grid_size+1,stride):
        for j in range(0,H-grid_size+1,stride):
            stacked_grid.append(tensor[:,i:i+stride,j:j+stride])
    return torch.stack(stacked_grid)


def main():
    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    test_transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Resize((1024,1024)),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
    rn18_weights = r"C:\github\DatathonxAI\backend\checkpoint\best_model_rn18.pth"

    test_set = ImageFolder(r"C:\github\DatathonxAI\backend\images", transform=test_transform)

    test_loader = DataLoader(test_set, batch_size=BATCH_SIZE,num_workers=0,pin_memory=True,shuffle=False)

    model = resnet18(rn18_weights, device)

    total_correct = 0
    trials = len(test_set)//BATCH_SIZE


    for image_tensor, label in test_loader:
        grid_tensor = scan_grid(image_tensor)
        
        label = label.to(device)
        grid_tensor = grid_tensor.to(device)

        logits = model(grid_tensor)
        prob = torch.softmax(logits, dim=1)
        
        predicted_classes = torch.argmax(prob,dim=1)
        correct_score = predicted_classes.sum().item()
        authenticity_score = correct_score/len(grid_tensor)

        if authenticity_score < 0.4:
            predicted_label = 0
        else:
            predicted_label = 1
        
        if predicted_label == label:
            total_correct += 1

    print(f'Final testing accuracy: {total_correct/trials:.2f}%')


if __name__ == "__main__":
    main()