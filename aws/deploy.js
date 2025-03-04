#!/usr/bin/env node
/**
 * AWS Lambda Deployment Script
 * 
 * This script automates the deployment of a Lambda function to AWS using CloudFormation.
 * It handles packaging the Lambda code, creating or updating the CloudFormation stack,
 * and configuring the Lambda function URL.
 * 
 * Features:
 * - Creates an S3 deployment bucket if it doesn't exist
 * - Packages Lambda code based on files listed in lambda_include.txt
 * - Uploads the package to S3
 * - Creates/updates CloudFormation stack
 * - Handles cleaning up failed stacks
 * - Sets up Lambda function URL for public access
 * - Supports production dependencies only in the deployment package
 * 
 * Usage:
 *   node deploy.js [options]
 * 
 * Options:
 *   --full-deploy    Force a full stack deployment instead of just code updates
 *   --verbose        Display detailed output during deployment
 *   --help           Show this help information
 * 
 * Requirements:
 *   - AWS CLI credentials configured
 *   - Node.js 16+
 *   - AWS SDK for JavaScript v3
 */

require('dotenv').config();
const { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFormationClient, DescribeStacksCommand, CreateStackCommand, UpdateStackCommand, 
        DeleteStackCommand, ListStackResourcesCommand } = require('@aws-sdk/client-cloudformation');
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand, 
        CreateFunctionUrlConfigCommand, GetFunctionUrlConfigCommand,
        AddPermissionCommand } = require('@aws-sdk/client-lambda');
const { IAMClient, GetRoleCommand, ListAttachedRolePoliciesCommand, 
        DetachRolePolicyCommand, ListRolePoliciesCommand, 
        DeleteRolePolicyCommand } = require('@aws-sdk/client-iam');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const { rimraf } = require('rimraf');
const archiver = require('archiver');
const { program } = require('commander');
const { fromIni } = require('@aws-sdk/credential-providers');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Configuration
const config = {
  serviceName: "gsheetagent",
  region: process.env.AWS_REGION || "ca-central-1",
  environment: "Production",
  codeDir: ".",
  templateFile: "template.yaml",
  includeFile: "lambda-include.txt",
  profile: process.env.AWS_PROFILE || "serverless-deploy"
};

// Derived configuration
config.stackName = `${config.serviceName}-${config.environment}`;
config.deploymentBucket = `${config.serviceName}-deployments-${config.region}`;

// Parse command-line arguments
program
  .option('--full-deploy', 'Force a full CloudFormation stack deployment')
  .option('--verbose', 'Display detailed logs during deployment')
  .option('--help', 'Show help information')
  .parse(process.argv);

const options = program.opts();
const VERBOSE = options.verbose || false;
const FORCE_FULL_DEPLOY = options.fullDeploy || false;

if (options.help) {
  program.help();
  process.exit(0);
}

// Create AWS service clients with the profile
const clientConfig = { 
  region: config.region,
  credentials: fromIni({ profile: config.profile })
};

const s3Client = new S3Client(clientConfig);
const cfClient = new CloudFormationClient(clientConfig);
const lambdaClient = new LambdaClient(clientConfig);
const iamClient = new IAMClient(clientConfig);

/**
 * Logs a status message with timestamp
 * @param {string} message - The message to log
 */
function logStatus(message) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.blue}[${timestamp}]${colors.reset} ${colors.yellow}${message}${colors.reset}`);
}

/**
 * Runs a command with optional verbose output
 * @param {Function} fn - The async function to run
 * @param {Array} args - Arguments for the function
 * @returns {Promise<any>} - The result of the function
 */
async function runCommand(fn, ...args) {
  try {
    const result = await fn(...args);
    if (VERBOSE) {
      console.log(JSON.stringify(result, null, 2));
    }
    return result;
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    if (VERBOSE) {
      console.error(error);
    }
    throw error;
  }
}

/**
 * Main deployment function
 */
async function deploy() {
  console.log(`\n${colors.green}========== Deploying ${config.serviceName} to ${config.environment} ==========${colors.reset}\n`);
  
  try {
    // Check if deployment bucket exists
    logStatus("Checking deployment bucket...");
    try {
      await runCommand(() => s3Client.send(new HeadBucketCommand({ Bucket: config.deploymentBucket })));
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
        logStatus(`Creating deployment bucket: ${config.deploymentBucket}`);
        await runCommand(() => s3Client.send(new CreateBucketCommand({ 
          Bucket: config.deploymentBucket,
          CreateBucketConfiguration: { LocationConstraint: config.region }
        })));
      } else {
        throw error;
      }
    }

    // Package the Lambda code
    logStatus("Packaging Lambda code...");
    const packagePath = await packageLambdaCode();

    // Upload to S3
    logStatus("Uploading code to S3...");
    await runCommand(() => s3Client.send(new PutObjectCommand({
      Bucket: config.deploymentBucket,
      Key: 'lambda-package.zip',
      Body: fs.createReadStream(packagePath)
    })));

    // Check if CloudFormation stack exists
    let stackStatus = "DOES_NOT_EXIST";
    try {
      const stackResponse = await runCommand(() => cfClient.send(new DescribeStacksCommand({ 
        StackName: config.stackName 
      })));
      stackStatus = stackResponse.Stacks[0].StackStatus;
    } catch (error) {
      if (error.name === 'ValidationError' && error.message.includes('does not exist')) {
        stackStatus = "DOES_NOT_EXIST";
      } else {
        throw error;
      }
    }

    logStatus(`Stack status: ${stackStatus}`);

    // Handle failed stacks
    if (stackStatus.includes('FAILED') || 
        stackStatus.includes('ROLLBACK_') || 
        stackStatus.includes('_FAILED')) {
      await cleanupFailedStack();
      stackStatus = "DOES_NOT_EXIST";
    }

    // Deploy the CloudFormation stack
    let functionName, functionArn, functionUrl;
    if (stackStatus === "DOES_NOT_EXIST") {
      await createNewStack();
      const outputs = await getStackOutputs();
      functionName = outputs.find(o => o.OutputKey === 'LambdaFunctionName')?.OutputValue;
    } else {
      if (FORCE_FULL_DEPLOY) {
        await updateFullStack();
      } else {
        // Get the function name from stack outputs
        const outputs = await getStackOutputs();
        functionName = outputs.find(o => o.OutputKey === 'LambdaFunctionName')?.OutputValue;
        
        if (!functionName) {
          logStatus("Function name not found in outputs. Updating whole stack...");
          await updateFullStack();
          const updatedOutputs = await getStackOutputs();
          functionName = updatedOutputs.find(o => o.OutputKey === 'LambdaFunctionName')?.OutputValue;
        } else {
          // Just update the Lambda code
          logStatus(`Updating Lambda function: ${functionName}`);
          await runCommand(() => lambdaClient.send(new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            S3Bucket: config.deploymentBucket,
            S3Key: 'lambda-package.zip',
            Publish: true
          })));
          
          logStatus("Lambda function updated successfully");
        }
      }
    }

    // Setup function URL if needed
    if (functionName) {
      functionUrl = await setupFunctionUrl(functionName);
      
      // Get function ARN
      const functionDetails = await runCommand(() => lambdaClient.send(new GetFunctionCommand({
        FunctionName: functionName
      })));
      functionArn = functionDetails.Configuration.FunctionArn;
      
      // Display Lambda function details
      console.log(`\n${colors.green}Lambda Function Details:${colors.reset}`);
      console.log(`  ${colors.yellow}Name:${colors.reset} ${functionName}`);
      console.log(`  ${colors.yellow}Region:${colors.reset} ${config.region}`);
      console.log(`  ${colors.yellow}ARN:${colors.reset} ${functionArn}`);
      if (functionUrl) {
        console.log(`  ${colors.yellow}Public URL:${colors.reset} ${functionUrl}`);
      }
    }

    // Clean up
    await rimrafPromise(path.join(__dirname, 'temp'));
    
    console.log(`\n${colors.green}✅ Deployment completed successfully!${colors.reset}\n`);
  } catch (error) {
    console.error(`\n${colors.red}❌ Deployment failed: ${error.message}${colors.reset}\n`);
    process.exit(1);
  }
}

// Helper function to promisify rimraf with the correct API
function rimrafPromise(path) {
  return rimraf(path); // New versions of rimraf already return a promise
}

/**
 * Packages Lambda code into a ZIP file
 * @returns {Promise<string>} Path to the created package
 */
async function packageLambdaCode() {
  // Create temp directories
  const tempDir = path.join(__dirname, 'temp');
  const buildDir = path.join(tempDir, 'build');
  const packagePath = path.join(tempDir, 'lambda-package.zip');
  
  await rimrafPromise(tempDir);
  await mkdir(tempDir, { recursive: true });
  await mkdir(buildDir, { recursive: true });

  // Copy package.json and package-lock.json
  logStatus("Copying package files...");
  await fs.promises.copyFile(
    path.join(process.cwd(), 'package.json'), 
    path.join(buildDir, 'package.json')
  );
  
  try {
    await fs.promises.copyFile(
      path.join(process.cwd(), 'package-lock.json'),
      path.join(buildDir, 'package-lock.json')
    );
  } catch (e) {
    // package-lock.json might not exist, that's okay
  }

  // Install production dependencies
  logStatus("Installing production dependencies...");
  execSync('npm install --production --no-optional', { 
    cwd: buildDir, 
    stdio: VERBOSE ? 'inherit' : 'ignore' 
  });

  // Read include file
  logStatus("Copying application files...");
  const includeFilePath = path.join(process.cwd(), config.includeFile);
  const includeContent = await readFile(includeFilePath, 'utf8');
  const includes = includeContent.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Copy each included file/directory
  for (const item of includes) {
    const sourcePath = path.join(process.cwd(), item);
    const destPath = path.join(buildDir, item);
    
    try {
      const stats = await fs.promises.stat(sourcePath);
      
      if (stats.isDirectory()) {
        logStatus(`Copying directory: ${item}`);
        await mkdir(destPath, { recursive: true });
        
        // Copy directory contents (except node_modules)
        const files = await fs.promises.readdir(sourcePath, { withFileTypes: true });
        for (const file of files) {
          if (file.name !== 'node_modules') {
            const srcFilePath = path.join(sourcePath, file.name);
            const destFilePath = path.join(destPath, file.name);
            
            if (file.isDirectory()) {
              execSync(`cp -r "${srcFilePath}" "${path.dirname(destFilePath)}/"`);
            } else {
              await fs.promises.copyFile(srcFilePath, destFilePath);
            }
          }
        }
      } else {
        logStatus(`Copying file: ${item}`);
        // Make sure the directory exists
        await mkdir(path.dirname(destPath), { recursive: true });
        await fs.promises.copyFile(sourcePath, destPath);
      }
    } catch (error) {
      console.warn(`${colors.yellow}Warning: Could not copy ${item}: ${error.message}${colors.reset}`);
    }
  }

  // Create ZIP file
  logStatus("Creating final deployment package...");
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(packagePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => resolve(packagePath));
    archive.on('error', reject);
    
    archive.pipe(output);
    archive.directory(buildDir, false);
    archive.finalize();
  });
}

/**
 * Cleans up a failed CloudFormation stack
 */
async function cleanupFailedStack() {
  logStatus("Cleaning up failed stack...");
  
  // First try to clean up IAM role that might be causing issues
  const roleName = `${config.serviceName}-lambda-role-${config.environment}`;
  
  try {
    await runCommand(() => iamClient.send(new GetRoleCommand({ RoleName: roleName })));
    
    // Role exists, clean it up
    logStatus("Cleaning up IAM role policies...");
    
    // Detach managed policies
    const managedPoliciesResponse = await runCommand(() => 
      iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName })));
    
    for (const policy of managedPoliciesResponse.AttachedPolicies || []) {
      await runCommand(() => iamClient.send(new DetachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policy.PolicyArn
      })));
    }
    
    // Delete inline policies
    const inlinePoliciesResponse = await runCommand(() => 
      iamClient.send(new ListRolePoliciesCommand({ RoleName: roleName })));
    
    for (const policyName of inlinePoliciesResponse.PolicyNames || []) {
      await runCommand(() => iamClient.send(new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName
      })));
    }
  } catch (error) {
    if (error.name !== 'NoSuchEntity') {
      console.warn(`${colors.yellow}Warning: ${error.message}${colors.reset}`);
    }
  }
  
  // Delete the stack
  logStatus("Deleting failed stack...");
  await runCommand(() => cfClient.send(new DeleteStackCommand({ 
    StackName: config.stackName 
  })));
  
  // Wait for stack deletion to complete
  logStatus("Waiting for stack deletion to complete (this may take a few minutes)...");
  
  const deleteTimeout = 300000; // 5 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < deleteTimeout) {
    try {
      const response = await cfClient.send(new DescribeStacksCommand({ 
        StackName: config.stackName 
      }));
      
      const status = response.Stacks[0].StackStatus;
      
      if (status === 'DELETE_COMPLETE') {
        logStatus("Stack deleted successfully");
        return;
      } else if (status === 'DELETE_FAILED') {
        logStatus("Stack deletion failed. Creating new stack with different name...");
        const timestamp = Math.floor(Date.now() / 1000);
        config.stackName = `${config.serviceName}-${config.environment}-${timestamp}`;
        logStatus(`New stack name: ${config.stackName}`);
        return;
      }
      
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      if (error.name === 'ValidationError' && error.message.includes('does not exist')) {
        logStatus("Stack deleted successfully");
        return;
      }
      throw error;
    }
  }
  
  console.log(`\n${colors.yellow}Stack deletion timed out. Continuing with new stack creation...${colors.reset}`);
}

/**
 * Creates a new CloudFormation stack
 */
async function createNewStack() {
  logStatus(`Creating new CloudFormation stack: ${config.stackName}`);
  
  const templateBody = await readFile(path.join(process.cwd(), config.templateFile), 'utf8');
  
  console.log(`${colors.yellow}Deploying stack (this may take several minutes)...${colors.reset}`);
  
  await runCommand(() => cfClient.send(new CreateStackCommand({
    StackName: config.stackName,
    TemplateBody: templateBody,
    Parameters: [
      { ParameterKey: 'ServiceName', ParameterValue: config.serviceName },
      { ParameterKey: 'EnvironmentType', ParameterValue: config.environment }
    ],
    Capabilities: ['CAPABILITY_NAMED_IAM']
  })));
  
  // Wait for stack creation to complete
  let stackStatus;
  do {
    await new Promise(resolve => setTimeout(resolve, 10000));
    process.stdout.write('.');
    
    const response = await cfClient.send(new DescribeStacksCommand({ 
      StackName: config.stackName 
    }));
    stackStatus = response.Stacks[0].StackStatus;
    
  } while (stackStatus === 'CREATE_IN_PROGRESS');
  
  console.log(''); // New line after progress dots
  
  if (stackStatus !== 'CREATE_COMPLETE') {
    throw new Error(`Stack creation failed: ${stackStatus}`);
  }
  
  logStatus("Stack creation completed successfully");
}

/**
 * Updates the full CloudFormation stack
 */
async function updateFullStack() {
  logStatus("Updating CloudFormation stack...");
  
  const templateBody = await readFile(path.join(process.cwd(), config.templateFile), 'utf8');
  
  try {
    await runCommand(() => cfClient.send(new UpdateStackCommand({
      StackName: config.stackName,
      TemplateBody: templateBody,
      Parameters: [
        { ParameterKey: 'ServiceName', ParameterValue: config.serviceName },
        { ParameterKey: 'EnvironmentType', ParameterValue: config.environment }
      ],
      Capabilities: ['CAPABILITY_NAMED_IAM']
    })));
    
    // Wait for stack update to complete
    let stackStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 10000));
      process.stdout.write('.');
      
      const response = await cfClient.send(new DescribeStacksCommand({ 
        StackName: config.stackName 
      }));
      stackStatus = response.Stacks[0].StackStatus;
      
    } while (stackStatus === 'UPDATE_IN_PROGRESS' || 
             stackStatus === 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS');
    
    console.log(''); // New line after progress dots
    
    if (stackStatus !== 'UPDATE_COMPLETE') {
      throw new Error(`Stack update failed: ${stackStatus}`);
    }
    
    logStatus("Stack update completed successfully");
  } catch (error) {
    if (error.message && error.message.includes('No updates are to be performed')) {
      logStatus("No updates needed for CloudFormation stack");
    } else {
      throw error;
    }
  }
}

/**
 * Gets the outputs from the CloudFormation stack
 * @returns {Promise<Array>} Stack outputs
 */
async function getStackOutputs() {
  const response = await cfClient.send(new DescribeStacksCommand({ 
    StackName: config.stackName 
  }));
  
  return response.Stacks[0].Outputs || [];
}

/**
 * Sets up a public URL for the Lambda function
 * @param {string} functionName - The Lambda function name
 * @returns {Promise<string|null>} The function URL or null
 */
async function setupFunctionUrl(functionName) {
  logStatus("Setting up public URL for Lambda function...");
  
  try {
    // Check if function URL already exists
    const urlConfig = await lambdaClient.send(new GetFunctionUrlConfigCommand({
      FunctionName: functionName
    }));
    
    return urlConfig.FunctionUrl;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Create function URL
      logStatus("Creating new function URL...");
      const response = await runCommand(() => lambdaClient.send(new CreateFunctionUrlConfigCommand({
        FunctionName: functionName,
        AuthType: 'NONE'
      })));
      
      // Add permission for public access
      await runCommand(() => lambdaClient.send(new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: 'FunctionURLAllowPublicAccess',
        Action: 'lambda:InvokeFunctionUrl',
        Principal: '*',
        FunctionUrlAuthType: 'NONE'
      })));
      
      return response.FunctionUrl;
    }
    
    throw error;
  }
}

// Run the deployment
deploy(); 