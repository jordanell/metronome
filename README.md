# Metronome static site

This repository contains the static Metronome site. Only `dist/` is deployed.

## Local development

Use Node 22 and npm from the repository root:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The dev build uses this origin in discovery metadata by default. Set `SITE_URL` if you need another origin. Tailwind and JavaScript reload as you edit. The generated public files live in ignored `.generated/`.

## Build

```sh
SITE_URL=https://your-production-domain.example npm run build
```

`SITE_URL` is mandatory for production builds and must be an HTTPS origin with no trailing slash. Optional `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` values add ownership metadata at build time. `dist/` contains the homepage, hashed JavaScript and CSS, discovery files, manifest, images, and existing error pages.

## Static production stack

Supply the production hostname and Route 53 hosted zone, plus an issued ACM certificate in `us-east-1` covering that hostname. CloudFront uses a private S3 bucket with signed origin access and a standard Route 53 A alias record.

```sh
aws cloudformation validate-template --region "$AWS_REGION" --template-body file://aws/cloudformation.yml
aws cloudformation deploy --region "$AWS_REGION" --stack-name "$STATIC_STACK_NAME" \
  --template-file aws/cloudformation.yml \
  --parameter-overrides EnvironmentName="$ENVIRONMENT_NAME" DomainName="$DOMAIN_NAME" \
    HostedZoneId="$HOSTED_ZONE_ID" CertificateArn="$CLOUDFRONT_CERTIFICATE_ARN"
```

Read `SiteBucketName`, `DistributionId`, and `DistributionDomainName` from the stack outputs. The distribution will initially return the configured 404 page until `dist/` is uploaded. The bucket is retained if the stack is deleted, so clean it up deliberately when it is no longer needed.

## CI deployment

CircleCI requires `SITE_URL`, `AWS_REGION`, and `STATIC_STACK_NAME`, plus AWS credentials with permission to read stack outputs, upload/delete objects in the dedicated site bucket, and create CloudFront invalidations. `SITE_URL` must match `https://$DOMAIN_NAME`. On `main`, CI builds the site, uploads hashed assets before HTML, syncs the root files, and invalidates CloudFront. Old hashed assets remain available to clients holding cached HTML. CI does not deploy CloudFormation automatically.

## Replace the Rails deployment

1. Retire the Rails CloudFormation stack. Its Route 53 A record must be removed before creating the static stack with the same hostname; stopping ECS tasks alone leaves that record in place. The old template retains its ECR repository and snapshots its RDS database on deletion.
2. Create the static stack with the command above. Downtime is expected between removing the old DNS record and completing the new deployment.
3. Build and upload `dist/` through CircleCI or the same S3 commands in `.circleci/config.yml`. Inspect `/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/manifest.json`, images, and unknown-path 404 behavior at the production HTTPS hostname.
