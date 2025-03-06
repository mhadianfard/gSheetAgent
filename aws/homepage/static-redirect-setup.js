#!/usr/bin/env node

/**
 * =============================================================================
 * Static Redirect Setup for gsheetagent.app Domain
 * =============================================================================
 *
 * OVERVIEW:
 * This script sets up a static website at gsheetagent.app that redirects to the
 * GitHub repository by:
 *   1. Creating an S3 bucket (if it doesn't exist)
 *   2. Uploading a static HTML page with redirect
 *   3. Verifying the SSL certificate is issued (ACM)
 *   4. Creating/using a CloudFront distribution for the S3 bucket
 *   5. Setting up DNS records in Route 53 to point the domain to CloudFront
 *
 * REQUIREMENTS:
 *   - AWS CLI configured with appropriate permissions
 *   - ACM certificate already requested for the domain
 *   - Route 53 hosted zone already created for the domain
 *   - Node.js installed
 *
 * USAGE:
 *   node static-redirect-setup.js <certificate-arn> <hosted-zone-id>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Colors for terminal output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(`${RED}Usage: node static-redirect-setup.js <certificate-arn> <hosted-zone-id>${NC}`);
  console.error(`Example: node static-redirect-setup.js arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-abcd-1234-abcd-1234abcd1234 Z1234567890ABCDEFGHI`);
  process.exit(1);
}

const CERTIFICATE_ARN = args[0];
const HOSTED_ZONE_ID = args[1];
const DOMAIN = "gsheetagent.app";
const BUCKET_NAME = DOMAIN;
const GITHUB_URL = "https://github.com/mhadianfard/gSheetAgent#readme";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Execute AWS CLI command and return the JSON result
 */
function executeAwsCommand(command) {
  try {
    const output = execSync(command, { encoding: 'utf8' });
    return JSON.parse(output);
  } catch (error) {
    console.error(`${RED}Error executing command: ${command}${NC}`);
    console.error(`${RED}${error.message}${NC}`);
    process.exit(1);
  }
}

/**
 * Execute AWS CLI command that returns text
 */
function executeAwsCommandText(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`${RED}Error executing command: ${command}${NC}`);
    console.error(`${RED}${error.message}${NC}`);
    process.exit(1);
  }
}

/**
 * Execute AWS CLI command with no return (for commands that don't output JSON)
 */
function executeAwsCommandNoReturn(command) {
  try {
    execSync(command, { encoding: 'utf8', stdio: 'inherit' });
  } catch (error) {
    console.error(`${RED}Error executing command: ${command}${NC}`);
    console.error(`${RED}${error.message}${NC}`);
    process.exit(1);
  }
}

/**
 * Create HTML content for redirect
 */
function createRedirectHTML() {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Redirecting to gSheetAgent GitHub</title>
    <meta http-equiv="refresh" content="0; URL=${GITHUB_URL}">
    <link rel="canonical" href="${GITHUB_URL}">
</head>
<body>
    <p>Redirecting to <a href="${GITHUB_URL}">gSheetAgent GitHub Repository</a>...</p>
    <script>window.location.href = "${GITHUB_URL}";</script>
</body>
</html>`;
}

/**
 * Create and configure S3 bucket
 */
async function setupS3Bucket() {
  console.log(`${YELLOW}Checking if S3 bucket exists...${NC}`);
  
  // Check if bucket exists
  let bucketExists = false;
  try {
    executeAwsCommandText(`aws s3api head-bucket --bucket ${BUCKET_NAME}`);
    bucketExists = true;
    console.log(`${GREEN}Bucket ${BUCKET_NAME} already exists.${NC}`);
  } catch (error) {
    console.log(`${YELLOW}Bucket does not exist. Creating new bucket...${NC}`);
  }
  
  // Create bucket if it doesn't exist
  if (!bucketExists) {
    // Create the bucket in us-east-1 region
    executeAwsCommandNoReturn(`aws s3api create-bucket --bucket ${BUCKET_NAME} --region us-east-1`);
    console.log(`${GREEN}Created bucket ${BUCKET_NAME}${NC}`);
  }
  
  // Configure bucket for static website hosting
  console.log(`${YELLOW}Configuring bucket for static website hosting...${NC}`);
  executeAwsCommandNoReturn(`aws s3 website s3://${BUCKET_NAME} --index-document index.html`);
  
  // Set bucket policy to allow public read access
  console.log(`${YELLOW}Setting bucket policy...${NC}`);
  const bucketPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
      }
    ]
  };
  
  const tempPolicyFile = `/tmp/s3-policy-${Date.now()}.json`;
  fs.writeFileSync(tempPolicyFile, JSON.stringify(bucketPolicy));
  
  executeAwsCommandNoReturn(`aws s3api put-bucket-policy --bucket ${BUCKET_NAME} --policy file://${tempPolicyFile}`);
  fs.unlinkSync(tempPolicyFile);
  
  // Create and upload redirect HTML file
  console.log(`${YELLOW}Creating and uploading redirect HTML...${NC}`);
  const htmlContent = createRedirectHTML();
  const tempHtmlFile = `/tmp/redirect-${Date.now()}.html`;
  fs.writeFileSync(tempHtmlFile, htmlContent);
  
  executeAwsCommandNoReturn(`aws s3 cp ${tempHtmlFile} s3://${BUCKET_NAME}/index.html --content-type "text/html" --cache-control "max-age=3600"`);
  fs.unlinkSync(tempHtmlFile);
  
  // Return the website endpoint
  return `${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com`;
}

/**
 * Create a new CloudFront distribution for S3 bucket
 */
function createDistribution(s3WebsiteUrl) {
  // Create a distribution configuration
  const distributionConfig = {
    CallerReference: Date.now().toString(),
    Aliases: {
      Quantity: 1,
      Items: [DOMAIN]
    },
    DefaultRootObject: "index.html",
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "S3Origin",
          DomainName: s3WebsiteUrl,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: "http-only",
            OriginSslProtocols: {
              Quantity: 1,
              Items: ["TLSv1.2"]
            },
            OriginReadTimeout: 30,
            OriginKeepaliveTimeout: 5
          }
        }
      ]
    },
    DefaultCacheBehavior: {
      TargetOriginId: "S3Origin",
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: 2,
        Items: ["GET", "HEAD"],
        CachedMethods: {
          Quantity: 2,
          Items: ["GET", "HEAD"]
        }
      },
      ForwardedValues: {
        QueryString: false,
        Cookies: { Forward: "none" },
        Headers: {
          Quantity: 0
        }
      },
      MinTTL: 0,
      DefaultTTL: 86400,
      MaxTTL: 31536000,
      Compress: true
    },
    CacheBehaviors: {
      Quantity: 0
    },
    CustomErrorResponses: {
      Quantity: 0
    },
    Comment: "Distribution for gsheetagent.app GitHub redirect",
    Logging: {
      Enabled: false,
      IncludeCookies: false,
      Bucket: "",
      Prefix: ""
    },
    PriceClass: "PriceClass_All",
    Enabled: true,
    ViewerCertificate: {
      ACMCertificateArn: CERTIFICATE_ARN,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021"
    },
    Restrictions: {
      GeoRestriction: {
        RestrictionType: "none",
        Quantity: 0
      }
    },
    WebACLId: "",
    HttpVersion: "http2",
    IsIPV6Enabled: true
  };
  
  // Write config to a temporary file
  const tempFile = `/tmp/cloudfront-config-${Date.now()}.json`;
  fs.writeFileSync(tempFile, JSON.stringify(distributionConfig));
  
  // Create CloudFront distribution
  console.log(`${YELLOW}Creating CloudFront distribution...${NC}`);
  const createCmd = `aws cloudfront create-distribution --distribution-config file://${tempFile}`;
  const cfResponse = executeAwsCommand(createCmd);
  
  // Extract the CloudFront domain name and ID
  const cfDomain = cfResponse.Distribution.DomainName;
  const cfId = cfResponse.Distribution.Id;
  
  console.log(`${GREEN}CloudFront distribution created:${NC}`);
  console.log(`  ${YELLOW}Distribution ID:${NC} ${cfId}`);
  console.log(`  ${YELLOW}Domain Name:${NC} ${cfDomain}`);
  
  // Clean up
  fs.unlinkSync(tempFile);
  
  return { id: cfId, domain: cfDomain };
}

/**
 * Main function
 */
async function main() {
  // Check certificate status
  console.log(`${YELLOW}Checking certificate status...${NC}`);
  const certStatus = executeAwsCommandText(`aws acm describe-certificate --certificate-arn ${CERTIFICATE_ARN} --region us-east-1 --query 'Certificate.Status' --output text`);
  
  if (certStatus !== "ISSUED") {
    console.error(`${RED}Certificate is not issued yet (current status: ${certStatus})${NC}`);
    console.error(`${YELLOW}Please wait for the certificate validation to complete and run this script again.${NC}`);
    console.error(`${YELLOW}You can check the status with:${NC}`);
    console.error(`aws acm describe-certificate --certificate-arn ${CERTIFICATE_ARN} --region us-east-1 --query 'Certificate.Status' --output text`);
    process.exit(1);
  }
  
  console.log(`${GREEN}Certificate is issued. Continuing with setup...${NC}`);
  
  // Setup S3 bucket with redirect
  const s3WebsiteUrl = await setupS3Bucket();
  console.log(`${GREEN}S3 website URL: ${s3WebsiteUrl}${NC}`);
  
  // Check for existing CloudFront distribution
  console.log(`${YELLOW}Checking for existing CloudFront distributions...${NC}`);
  const distributionsCmd = `aws cloudfront list-distributions --query "DistributionList.Items[?contains(Aliases.Items, '${DOMAIN}')].{Id:Id,DomainName:DomainName}" --output json`;
  const existingDistributions = executeAwsCommand(distributionsCmd);
  
  let cfId, cfDomain;
  
  if (existingDistributions && existingDistributions.length > 0) {
    const existingId = existingDistributions[0].Id;
    const existingDomain = existingDistributions[0].DomainName;
    
    console.log(`${YELLOW}Found existing CloudFront distribution:${NC}`);
    console.log(`  ${BLUE}Distribution ID:${NC} ${existingId}`);
    console.log(`  ${BLUE}Domain Name:${NC} ${existingDomain}`);
    
    // Ask user what to do
    console.log(`${YELLOW}Options:${NC}`);
    console.log(`  ${BLUE}1)${NC} Delete the existing distribution and create a new one`);
    console.log(`  ${BLUE}2)${NC} Use the existing distribution (will create/update DNS record only)`);
    console.log(`  ${BLUE}3)${NC} Abort`);
    
    const choice = await new Promise(resolve => {
      rl.question('Enter your choice (1-3): ', answer => {
        resolve(answer.trim());
      });
    });
    
    if (choice === '1') {
      console.log(`${YELLOW}Disabling existing CloudFront distribution...${NC}`);
      
      // Get the current config
      const configCmd = `aws cloudfront get-distribution-config --id ${existingId}`;
      const config = executeAwsCommand(configCmd);
      const etag = config.ETag;
      
      // Create a modified config with Enabled set to false
      const modifiedConfig = { ...config.DistributionConfig, Enabled: false };
      
      // Write the modified config to a temporary file
      const tempConfigFile = `/tmp/cf-config-${Date.now()}.json`;
      fs.writeFileSync(tempConfigFile, JSON.stringify(modifiedConfig));
      
      // Update the distribution
      const updateCmd = `aws cloudfront update-distribution --id ${existingId} --distribution-config file://${tempConfigFile} --if-match "${etag}"`;
      executeAwsCommand(updateCmd);
      
      console.log(`${YELLOW}Waiting for distribution to disable (this may take 15+ minutes)...${NC}`);
      execSync(`aws cloudfront wait distribution-deployed --id ${existingId}`, { stdio: 'inherit' });
      
      console.log(`${YELLOW}Deleting existing CloudFront distribution...${NC}`);
      // Get the new ETag after the update
      const newConfigCmd = `aws cloudfront get-distribution-config --id ${existingId}`;
      const newConfig = executeAwsCommand(newConfigCmd);
      const newEtag = newConfig.ETag;
      
      // Delete the distribution
      execSync(`aws cloudfront delete-distribution --id ${existingId} --if-match "${newEtag}"`, { stdio: 'inherit' });
      
      // Clean up
      fs.unlinkSync(tempConfigFile);
      
      // Continue with creating a new distribution
      const result = createDistribution(s3WebsiteUrl);
      cfId = result.id;
      cfDomain = result.domain;
      
    } else if (choice === '2') {
      console.log(`${GREEN}Using existing CloudFront distribution.${NC}`);
      cfId = existingId;
      cfDomain = existingDomain;
    } else {
      console.log(`${RED}Operation aborted.${NC}`);
      process.exit(0);
    }
  } else {
    console.log(`${GREEN}No existing CloudFront distribution found for ${DOMAIN}. Creating new distribution...${NC}`);
    const result = createDistribution(s3WebsiteUrl);
    cfId = result.id;
    cfDomain = result.domain;
  }
  
  // Check for existing DNS record
  console.log(`\n${YELLOW}Checking for existing DNS record...${NC}`);
  const dnsQuery = `aws route53 list-resource-record-sets --hosted-zone-id ${HOSTED_ZONE_ID} --query "ResourceRecordSets[?Name=='${DOMAIN}.' && Type=='A']" --output json`;
  const dnsRecords = executeAwsCommand(dnsQuery);
  
  let action = "CREATE";
  if (dnsRecords && dnsRecords.length > 0) {
    console.log(`${YELLOW}Found existing DNS record for ${DOMAIN}. Updating...${NC}`);
    action = "UPSERT";
  } else {
    console.log(`${GREEN}No existing DNS record found. Creating new record...${NC}`);
  }
  
  // Create or update DNS record
  console.log(`\n${YELLOW}${action}ing DNS record for ${DOMAIN}...${NC}`);
  const changeJson = {
    Changes: [
      {
        Action: action,
        ResourceRecordSet: {
          Name: DOMAIN,
          Type: "A",
          AliasTarget: {
            HostedZoneId: "Z2FDTNDATAQYW2", // Fixed ID for CloudFront
            DNSName: cfDomain,
            EvaluateTargetHealth: false
          }
        }
      }
    ]
  };
  
  // Write the change batch to a temporary file
  const tempDnsFile = `/tmp/dns-changes-${Date.now()}.json`;
  fs.writeFileSync(tempDnsFile, JSON.stringify(changeJson));
  
  const dnsCmd = `aws route53 change-resource-record-sets --hosted-zone-id ${HOSTED_ZONE_ID} --change-batch file://${tempDnsFile}`;
  const dnsResponse = executeAwsCommand(dnsCmd);
  const changeId = dnsResponse.ChangeInfo.Id;
  
  console.log(`${GREEN}DNS change request submitted:${NC}`);
  console.log(`  ${YELLOW}Change ID:${NC} ${changeId}`);
  
  // Wait for DNS change to complete
  console.log(`\n${YELLOW}Waiting for DNS changes to propagate...${NC}`);
  execSync(`aws route53 wait resource-record-sets-changed --id ${changeId}`, { stdio: 'inherit' });
  
  // Clean up
  fs.unlinkSync(tempDnsFile);
  
  console.log(`\n${GREEN}=====================================${NC}`);
  console.log(`${GREEN}✅ Setup completed successfully!${NC}`);
  console.log(`${GREEN}=====================================${NC}`);
  console.log(`Your domain ${BLUE}https://${DOMAIN}${NC} has been configured to redirect to ${BLUE}${GITHUB_URL}${NC}`);
  console.log(`DNS changes can take up to 24 hours to propagate globally, but often work within minutes.`);
  console.log(`CloudFront distribution may take up to 15 minutes to deploy.`);
  console.log(`\n${YELLOW}To check status:${NC}`);
  console.log(`CloudFront: aws cloudfront get-distribution --id ${cfId}`);
  console.log(`DNS Record: dig ${DOMAIN}`);
  console.log(`S3 Bucket: aws s3 ls s3://${BUCKET_NAME}`);
  
  // Close readline interface
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`${RED}Error: ${error.message}${NC}`);
  process.exit(1);
}); 