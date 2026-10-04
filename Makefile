SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

AWS_REGION := us-west-2
ECR_REGISTRY := 325789488776.dkr.ecr.us-west-2.amazonaws.com
ECR_REPOSITORY := $(ECR_REGISTRY)/click-track-prod-app
IMAGE_TAG ?= latest
IMAGE := $(ECR_REPOSITORY):$(IMAGE_TAG)

.PHONY: build ecr-login push

build:
	docker build --platform linux/amd64 --tag $(IMAGE) .

ecr-login:
	aws ecr get-login-password --profile me --region $(AWS_REGION) | \
		docker login --username AWS --password-stdin $(ECR_REGISTRY)

push: build ecr-login
	docker push $(IMAGE)
