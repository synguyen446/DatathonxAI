#This is a resnet18 wrapper

import torch
import torchvision

class Resnet18:
    def __init__(self):
        self.model = torchvision.models.resnet18(weights=torchvision.models.ResNet18_Weights.DEFAULT)
    
    def __call__(self,x):
        with torch.no_grad():
            return self.model(x)

def resnet18():
    return Resnet18()

