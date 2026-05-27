#This is a resnet18 wrapper

import torch
import torchvision

class Resnet18:
    def __init__(self,weights,device):
        self.model = torchvision.models.resnet18(weights=torchvision.models.ResNet18_Weights.DEFAULT)
        self.model.conv1 = torch.nn.Conv2d(3,64,kernel_size =3, stride=1, padding=1, bias=False)
        self.model.maxpool = torch.nn.Identity()
        self.model.fc = torch.nn.Linear(512,2)

        self.device = device
        self.weights = weights

    def __load_weights(self):
        self.model.load_state_dict(torch.load(self.weights,weights_only=True),strict=False)

    def __call__(self,x):
        with torch.no_grad():
            self.__load_weights()
            self.model.to(self.device)
            return self.model(x)

def resnet18(weights, device='cpu'):
    return Resnet18(weights,device)

