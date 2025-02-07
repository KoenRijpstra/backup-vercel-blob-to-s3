#!/usr/bin/env node

import 'dotenv/config'
import { list } from '@vercel/blob';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Command } from 'commander';

function createS3Client(options) {
  return new S3Client({
    region: options.region || process.env.AWS_REGION,
    credentials: {
      accessKeyId: options.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: options.secretKey || process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

async function fileExistsInS3(s3Client, bucketName, key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound') return false;
    if (error.$metadata?.httpStatusCode === 404) return false;
    
    // Log specific S3 errors
    if (error.name === 'NoSuchBucket') {
      throw new Error(`Bucket ${bucketName} does not exist`);
    }
    if (error.name === 'AccessDenied') {
      throw new Error('Access denied to S3 bucket - check your credentials');
    }
    throw new Error(`S3 check failed: ${error.name} - ${error.message}`);
  }
}

async function uploadToS3(s3Client, bucketName, url, key) {
  try {
    if (await fileExistsInS3(s3Client, bucketName, key)) {
      return { skipped: true, key };
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
    });

    await s3Client.send(command);
    return { skipped: false, key };
  } catch (error) {
    if (error.name === 'AccessDenied') {
      throw new Error('Access denied to S3 bucket - check your credentials');
    }
    if (error.name === 'NoSuchBucket') {
      throw new Error(`Bucket ${bucketName} does not exist`);
    }
    throw new Error(`Upload failed for ${key}: ${error.message}`);
  }
}

async function backupVercelStorageToS3(options) {
  const s3Client = createS3Client(options);
  const bucketName = options.bucket || process.env.AWS_BUCKET_NAME;
  
  async function fileExistsInS3(key) {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound') return false;
      if (error.$metadata?.httpStatusCode === 404) return false;
      
      if (error.name === 'NoSuchBucket') {
        throw new Error(`Bucket ${bucketName} does not exist`);
      }
      if (error.name === 'AccessDenied') {
        throw new Error('Access denied to S3 bucket - check your credentials');
      }
      throw new Error(`S3 check failed: ${error.name} - ${error.message}`);
    }
  }

  async function uploadToS3(url, key) {
    try {
      if (await fileExistsInS3(key)) {
        return { skipped: true, key };
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
      });

      await s3Client.send(command);
      return { skipped: false, key };
    } catch (error) {
      if (error.name === 'AccessDenied') {
        throw new Error('Access denied to S3 bucket - check your credentials');
      }
      if (error.name === 'NoSuchBucket') {
        throw new Error(`Bucket ${bucketName} does not exist`);
      }
      throw new Error(`Upload failed for ${key}: ${error.message}`);
    }
  }

  let cursor;
  let totalProcessed = 0;
  const BATCH_SIZE = options.batchSize || 10;
  const prefix = options.prefix || 'production/';

  console.log('Starting backup process...');
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Prefix: ${prefix}`);
  console.log(`Target bucket: ${bucketName}`);
  console.log(`AWS Region: ${options.region || process.env.AWS_REGION}`);

  do {
    const listResult = await list({
      cursor,
      limit: 1000,
      prefix,
    });

    if (listResult.blobs.length > 0) {
      // Process files in batches
      for (let i = 0; i < listResult.blobs.length; i += BATCH_SIZE) {
        const batch = listResult.blobs.slice(i, i + BATCH_SIZE);
        const promises = batch.map(blob => 
          uploadToS3(blob.url, blob.pathname)
            .then(result => {
              if (result.skipped) {
                console.log(`⏭️ Skipped: ${result.key} (already exists)`);
              } else {
                console.log(`✓ Backed up: ${result.key}`);
              }
            })
            .catch(error => console.error(`✗ Failed: ${blob.pathname}`, error.message))
        );

        await Promise.all(promises);
        totalProcessed += batch.length;
        console.log(`Progress: ${totalProcessed} files processed`);
      }
    }

    cursor = listResult.cursor;
  } while (cursor);

  console.log(`Backup complete. Total files processed: ${totalProcessed}`);
}

// Set up CLI
const program = new Command();

program
  .name('backup-vercel-storage')
  .description('Backup Vercel Blob Storage to S3')
  .version('1.0.0')
  .option('-b, --batch-size <number>', 'number of files to process concurrently', '10')
  .option('-p, --prefix <string>', 'prefix for files to backup', 'production/')
  .option('--region <string>', 'AWS region')
  .option('--bucket <string>', 'S3 bucket name')
  .option('--access-key-id <string>', 'AWS access key ID')
  .option('--secret-key <string>', 'AWS secret access key')
  .action(async (options) => {
    try {
      // Check for required parameters/env vars
      const requiredParams = [
        ['region', 'AWS_REGION'],
        ['accessKeyId', 'AWS_ACCESS_KEY_ID'],
        ['secretKey', 'AWS_SECRET_ACCESS_KEY'],
        ['bucket', 'AWS_BUCKET_NAME']
      ];

      const missing = requiredParams.filter(([param, envVar]) => {
        return !options[param] && !process.env[envVar];
      });

      if (missing.length > 0) {
        console.error('Missing required parameters. Please provide either command line arguments or environment variables:');
        missing.forEach(([param, envVar]) => {
          console.error(`  --${param.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)} or ${envVar}`);
        });
        process.exit(1);
      }

      options.batchSize = parseInt(options.batchSize, 10);
      if (isNaN(options.batchSize) || options.batchSize < 1) {
        console.error('Batch size must be a positive number');
        process.exit(1);
      }

      await backupVercelStorageToS3(options);
    } catch (error) {
      console.error('Backup process failed:', error.message);
      process.exit(1);
    }
  });

program.parse();