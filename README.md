# Metronome

A simple metronome app.

## Development

Install Node 22.20.0.

Use Node 22 and npm from the repository root:

```sh
npm run dev
```

Open `http://127.0.0.1:5173`.

## Build

```sh
SITE_URL=https://click-track.app npm run build
```

`dist/` contains the build pages including thehomepage, hashed JavaScript and CSS, discovery files, manifest, images, and error pages.

## Deployment

Read `SiteBucketName`, `DistributionId`, and `DistributionDomainName` from the AWS CloufFormation stack outputs.

```bash
aws s3 sync dist/assets/ "s3://$bucket/assets/" --region "$AWS_REGION" --cache-control "public,max-age=31536000,immutable" --profile "$PROFILE_ID"
aws s3 sync dist/ "s3://$bucket/" --region "$AWS_REGION" --delete --exclude "assets/*" --cache-control "public,max-age=300" --profile "$PROFILE_ID"
aws s3 cp dist/index.html "s3://$bucket/index.html" --region "$AWS_REGION" --content-type "text/html; charset=utf-8" --cache-control "no-cache" --profile "$PROFILE_ID"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' --profile "$PROFILE_ID"
            ```

These steps upload hashed assets before HTML, syncs the root files, and invalidates CloudFront. Old hashed assets remain available to clients holding cached HTML.
