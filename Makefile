SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

AWS_REGION := ca-central-1
ECR_REGISTRY := 043477507952.dkr.ecr.ca-central-1.amazonaws.com
ECR_REPOSITORY := $(ECR_REGISTRY)/metronome-app
IMAGE_TAG ?= latest
IMAGE := $(ECR_REPOSITORY):$(IMAGE_TAG)

.PHONY: build ecr-login push

build:
	docker build --platform linux/amd64 --tag $(IMAGE) .

ecr-login:
	aws ecr get-login-password --region $(AWS_REGION) | \
		docker login --username AWS --password-stdin $(ECR_REGISTRY)

push: build ecr-login
	docker push $(IMAGE)
