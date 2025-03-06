#!/usr/bin/env node

/**
 * =============================================================================
 * Domain Preparation Script for AWS
 * =============================================================================
 *
 * OVERVIEW:
 * This script prepares the essential AWS resources needed before setting up a 
 * static website by:
 *   1. Creating a Route 53 hosted zone for your domain (if it doesn't exist)
 *   2. Requesting an SSL certificate from AWS Certificate Manager
 *   3. Creating DNS validation records to verify domain ownership
 *   4. Providing the necessary IDs for the static-redirect-setup.js script
 *
 * REQUIREMENTS:
 *   - AWS CLI configured with appropriate permissions
 *   - Domain already registered with a domain registrar
 *   - Node.js installed
 *
 * IMPORTANT:
 *   After running this script, you will need to update your domain's nameservers
 *   at your registrar to point to the Route 53 nameservers provided by this script.
 *
 * USAGE:
 *   node domain-prep.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');

// Colors for terminal output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

const DOMAIN = "gsheetagent.app";

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
 * Main function
 */
async function main() {
  console.log(`${GREEN}==============================================================${NC}`);
  console.log(`${GREEN}Domain Preparation for ${BLUE}${DOMAIN}${NC}`);
  console.log(`${GREEN}==============================================================${NC}\n`);

  // Check if domain is registered
  const confirmation = await new Promise(resolve => {
    rl.question(`${YELLOW}Have you already registered the domain ${BLUE}${DOMAIN}${YELLOW} with a domain registrar? (y/n): ${NC}`, answer => {
      resolve(answer.trim().toLowerCase());
    });
  });

  if (confirmation !== 'y' && confirmation !== 'yes') {
    console.log(`${RED}Please register the domain first and then run this script again.${NC}`);
    console.log(`${YELLOW}You can register domains through AWS Route 53 or other registrars like Namecheap, GoDaddy, etc.${NC}`);
    process.exit(0);
  }

  // Step 1: Create/check Route 53 hosted zone
  console.log(`\n${YELLOW}Step 1: Creating/checking Route 53 hosted zone...${NC}`);
  let hostedZoneId;

  // Check if a hosted zone already exists for the domain
  console.log(`${YELLOW}Checking for existing hosted zones...${NC}`);
  const listZonesCmd = `aws route53 list-hosted-zones-by-name --dns-name ${DOMAIN} --max-items 1`;
  const zonesResponse = executeAwsCommand(listZonesCmd);

  if (zonesResponse.HostedZones.length > 0 && zonesResponse.HostedZones[0].Name === `${DOMAIN}.`) {
    hostedZoneId = zonesResponse.HostedZones[0].Id.replace('/hostedzone/', '');
    console.log(`${GREEN}Found existing hosted zone:${NC}`);
    console.log(`  ${YELLOW}Hosted Zone ID:${NC} ${hostedZoneId}`);
  } else {
    console.log(`${YELLOW}No existing hosted zone found. Creating a new one...${NC}`);
    const createZoneCmd = `aws route53 create-hosted-zone --name ${DOMAIN} --caller-reference ${Date.now()}`;
    const createZoneResponse = executeAwsCommand(createZoneCmd);
    hostedZoneId = createZoneResponse.HostedZone.Id.replace('/hostedzone/', '');
    console.log(`${GREEN}Created new hosted zone:${NC}`);
    console.log(`  ${YELLOW}Hosted Zone ID:${NC} ${hostedZoneId}`);
  }

  // Get nameservers for the hosted zone
  const getZoneCmd = `aws route53 get-hosted-zone --id ${hostedZoneId}`;
  const zoneDetails = executeAwsCommand(getZoneCmd);
  const nameservers = zoneDetails.DelegationSet.NameServers;

  console.log(`${GREEN}Nameservers for your domain:${NC}`);
  nameservers.forEach(ns => {
    console.log(`  ${BLUE}${ns}${NC}`);
  });

  console.log(`\n${YELLOW}IMPORTANT: You must update your domain's nameservers at your registrar to the above values.${NC}`);
  console.log(`${YELLOW}Without this step, AWS will not be able to manage DNS for your domain.${NC}`);

  const nsConfirmation = await new Promise(resolve => {
    rl.question(`${YELLOW}Have you updated the nameservers or will you do it soon? (y/n): ${NC}`, answer => {
      resolve(answer.trim().toLowerCase());
    });
  });

  if (nsConfirmation !== 'y' && nsConfirmation !== 'yes') {
    console.log(`${RED}Please update the nameservers at your registrar and then run the next script.${NC}`);
    console.log(`${YELLOW}You can still continue, but DNS validation for the certificate will fail until nameservers are updated.${NC}`);
  }

  // Step 2: Request SSL certificate
  console.log(`\n${YELLOW}Step 2: Requesting SSL certificate from AWS Certificate Manager...${NC}`);
  
  // Check if a certificate already exists for the domain
  console.log(`${YELLOW}Checking for existing certificates...${NC}`);
  const listCertsCmd = `aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='${DOMAIN}']"`;
  const existingCerts = executeAwsCommand(listCertsCmd);
  
  let certificateArn;
  
  if (existingCerts.length > 0) {
    certificateArn = existingCerts[0].CertificateArn;
    console.log(`${GREEN}Found existing certificate:${NC}`);
    console.log(`  ${YELLOW}Certificate ARN:${NC} ${certificateArn}`);
    
    // Check the status of the certificate
    const certStatusCmd = `aws acm describe-certificate --certificate-arn ${certificateArn} --region us-east-1 --query 'Certificate.Status' --output text`;
    const certStatus = executeAwsCommandText(certStatusCmd);
    console.log(`  ${YELLOW}Certificate Status:${NC} ${certStatus}`);
    
    if (certStatus === 'PENDING_VALIDATION') {
      console.log(`${YELLOW}Certificate is pending validation. Let's check if we need to create validation records.${NC}`);
    } else if (certStatus === 'ISSUED') {
      console.log(`${GREEN}Certificate is already issued and ready to use.${NC}`);
    } else {
      console.log(`${RED}Certificate is in ${certStatus} state. You may need to request a new one.${NC}`);
    }
  } else {
    console.log(`${YELLOW}No existing certificate found. Requesting a new one...${NC}`);
    const requestCertCmd = `aws acm request-certificate --domain-name ${DOMAIN} --validation-method DNS --region us-east-1`;
    const requestCertResponse = executeAwsCommand(requestCertCmd);
    certificateArn = requestCertResponse.CertificateArn;
    console.log(`${GREEN}Certificate requested:${NC}`);
    console.log(`  ${YELLOW}Certificate ARN:${NC} ${certificateArn}`);
  }
  
  // Step 3: Create DNS validation records
  console.log(`\n${YELLOW}Step 3: Creating DNS validation records...${NC}`);
  
  // We need to wait a moment for the certificate info to be available
  console.log(`${YELLOW}Waiting for certificate details to become available...${NC}`);
  
  // Retry logic for getting certificate details
  let certDetails;
  let retries = 0;
  const maxRetries = 10;
  
  while (retries < maxRetries) {
    try {
      const certDetailsCmd = `aws acm describe-certificate --certificate-arn ${certificateArn} --region us-east-1`;
      certDetails = executeAwsCommand(certDetailsCmd);
      
      if (certDetails.Certificate.DomainValidationOptions[0].ResourceRecord) {
        break; // We have the validation records
      }
      
      console.log(`${YELLOW}Waiting for validation information to be available (attempt ${retries + 1}/${maxRetries})...${NC}`);
      // Wait 5 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
      retries++;
    } catch (error) {
      console.log(`${YELLOW}Waiting for validation information to be available (attempt ${retries + 1}/${maxRetries})...${NC}`);
      // Wait 5 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
      retries++;
    }
  }
  
  if (!certDetails || !certDetails.Certificate.DomainValidationOptions[0].ResourceRecord) {
    console.error(`${RED}Failed to get certificate validation records after ${maxRetries} attempts.${NC}`);
    console.error(`${YELLOW}Please try running the script again in a few minutes.${NC}`);
    process.exit(1);
  }
  
  // Create validation records in Route 53
  const validationOption = certDetails.Certificate.DomainValidationOptions[0];
  const recordName = validationOption.ResourceRecord.Name;
  const recordValue = validationOption.ResourceRecord.Value;
  const recordType = validationOption.ResourceRecord.Type;
  
  console.log(`${YELLOW}Creating DNS validation record:${NC}`);
  console.log(`  ${YELLOW}Record Name:${NC} ${recordName}`);
  console.log(`  ${YELLOW}Record Type:${NC} ${recordType}`);
  console.log(`  ${YELLOW}Record Value:${NC} ${recordValue}`);
  
  // Check if validation record already exists
  const listRecordsCmd = `aws route53 list-resource-record-sets --hosted-zone-id ${hostedZoneId} --query "ResourceRecordSets[?Name=='${recordName}' && Type=='${recordType}']"`;
  const existingRecords = executeAwsCommand(listRecordsCmd);
  
  let recordAction = "CREATE";
  if (existingRecords.length > 0) {
    console.log(`${YELLOW}Validation record already exists. Updating if needed...${NC}`);
    recordAction = "UPSERT";
  }
  
  // Create or update the validation record
  const changeJson = {
    Changes: [
      {
        Action: recordAction,
        ResourceRecordSet: {
          Name: recordName,
          Type: recordType,
          TTL: 300,
          ResourceRecords: [
            {
              Value: recordValue
            }
          ]
        }
      }
    ]
  };
  
  const tempChangeFile = `/tmp/dns-validation-${Date.now()}.json`;
  fs.writeFileSync(tempChangeFile, JSON.stringify(changeJson));
  
  const changeCmd = `aws route53 change-resource-record-sets --hosted-zone-id ${hostedZoneId} --change-batch file://${tempChangeFile}`;
  const changeResponse = executeAwsCommand(changeCmd);
  
  console.log(`${GREEN}DNS validation record ${recordAction === "CREATE" ? "created" : "updated"}:${NC}`);
  console.log(`  ${YELLOW}Change ID:${NC} ${changeResponse.ChangeInfo.Id}`);
  
  // Clean up
  fs.unlinkSync(tempChangeFile);
  
  // Wait for DNS changes to propagate
  console.log(`${YELLOW}Waiting for DNS changes to propagate...${NC}`);
  const changeId = changeResponse.ChangeInfo.Id.replace('/change/', '');
  executeAwsCommandText(`aws route53 wait resource-record-sets-changed --id ${changeId}`);
  
  console.log(`${GREEN}DNS changes have propagated.${NC}`);
  
  // Show next steps
  console.log(`\n${GREEN}==============================================================${NC}`);
  console.log(`${GREEN}✅ Domain preparation completed!${NC}`);
  console.log(`${GREEN}==============================================================${NC}`);
  console.log(`${YELLOW}Important Information for next steps:${NC}`);
  console.log(`${YELLOW}Certificate ARN:${NC} ${certificateArn}`);
  console.log(`${YELLOW}Hosted Zone ID:${NC} ${hostedZoneId}`);
  
  console.log(`\n${BLUE}Next Steps:${NC}`);
  console.log(`${YELLOW}1. Make sure you have updated your domain's nameservers at your registrar${NC}`);
  console.log(`${YELLOW}2. Wait for the certificate to be validated (can take from minutes to hours)${NC}`);
  console.log(`${YELLOW}   You can check the status with:${NC}`);
  console.log(`   aws acm describe-certificate --certificate-arn ${certificateArn} --region us-east-1 --query 'Certificate.Status' --output text`);
  console.log(`${YELLOW}3. Once certificate is ISSUED, run the static-redirect-setup.js script:${NC}`);
  console.log(`   node static-redirect-setup.js ${certificateArn} ${hostedZoneId}`);
  
  // Close readline interface
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error(`${RED}Error: ${error.message}${NC}`);
  process.exit(1);
}); 