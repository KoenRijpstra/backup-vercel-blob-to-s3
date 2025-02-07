# Backup Vercel Blob to S3

A CLI tool to backup your Vercel Blob Storage to Amazon S3. This tool helps you maintain a secondary backup of your Vercel Blob Storage files by automatically syncing them to an S3 bucket.

## Features

- Batch processing of files for efficient transfers
- Skip existing files in S3 to avoid redundant transfers
- Configurable via CLI options or environment variables
- Progress tracking and detailed logging
- GitHub Actions support for automated backups

## Installation

```bash
npm install -g https://github.com/KoenRijpstra/backup-vercel-blob-to-s3
```

## Prerequisites

Before using this tool, you'll need:

1. A Vercel Blob Storage account with a read token
2. An AWS account with S3 access
3. Node.js installed on your system

## Configuration

You can configure the tool using either environment variables or command-line options.

### Environment Variables

Create a `.env` file with these variables:

```env
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
AWS_REGION=your_aws_region
AWS_BUCKET_NAME=your_bucket_name
AWS_ACCESS_KEY_ID=your_aws_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
```

### Command-Line Options

```bash
backup-vercel-blob-to-s3 [options]
```

Available options:

- `-b, --batch-size <number>` - Number of files to process concurrently (default: 10)
- `-p, --prefix <string>` - Prefix for files to backup (default: 'production/')
- `--region <string>` - AWS region
- `--bucket <string>` - S3 bucket name
- `--access-key-id <string>` - AWS access key ID
- `--secret-key <string>` - AWS secret access key

## GitHub Actions Integration

You can automate your backups using this GitHub Actions workflow:

```yaml
name: storage-backup

on:
  schedule:
    - cron: "0 0 * * *" # Runs at midnight
  workflow_dispatch:

jobs:
  storage-backup:
    runs-on: ubuntu-latest

    env:
      BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
      AWS_REGION: "us-east-1"
      AWS_BUCKET_NAME: ${{ secrets.S3_BUCKET_NAME }}
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

    steps:
      - run: |
          npm install -g https://github.com/KoenRijpstra/backup-vercel-blob-to-s3

      - run: |
          backup-vercel-blob-to-s3
```
