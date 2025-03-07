#!/usr/bin/env node
/**
 * AWS Lambda Deployment Script
 * 
 * This script automates the deployment of a Node.js application to AWS Lambda.
 * It handles packaging the application, uploading to S3, and deploying via CloudFormation.
 * 
 * Usage:
 *   node aws/deploy.js [options]
 * 
 * Options:
 *   --region <region>     AWS region to deploy to (default: from config or AWS_REGION env var)
 *   --environment <env>   Deployment environment (default: Production)
 *   --service <name>      Service name (default: from config)
 *   --verbose             Show verbose output
 *   --full-deploy         Force a full CloudFormation stack update instead of just code update
 * 
 * Required Files:
 *   - aws/template.yaml     CloudFormation template
 *   - lambda-include.txt    List of files/directories to include in the package
 *   - .env                  (Optional) Environment variables to set on the Lambda function
 * 
 * Environment Variables:
 *   - AWS_REGION           Override region (if not specified in config or arguments)
 *   - AWS_PROFILE          AWS credentials profile to use
 * 
 * The script:
 *   1. Packages application code and dependencies
 *   2. Creates/updates S3 bucket for deployment
 *   3. Uploads packaged code to S3
 *   4. Creates/updates CloudFormation stack
 *   5. Sets environment variables on Lambda
 *   6. Configures a public Lambda function URL
 *   7. Generates and sets a build number
 * 
 * Notes:
 *   - Uses retry mechanism for environment variable updates
 *   - Handles creating proper permissions for Lambda function URL
 *   - Generates build number (timestamp) for each deployment
 */

require('dotenv').config();
const { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFormationClient, DescribeStacksCommand, CreateStackCommand, UpdateStackCommand, 
        DeleteStackCommand, ListStackResourcesCommand } = require('@aws-sdk/client-cloudformation');
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand, 
        CreateFunctionUrlConfigCommand, GetFunctionUrlConfigCommand,
        AddPermissionCommand, UpdateFunctionConfigurationCommand, GetPolicyCommand } = require('@aws-sdk/client-lambda');
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
const { generateBuildNumber } = require('../utils/build');

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
  templateFile: path.join(__dirname, "template.yaml"),
  includeFile: path.join(__dirname, "lambda-include.txt"),
  profile: process.env.AWS_PROFILE || "serverless-deploy",
  serverLabel: "server.gsheetagent.app"
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
 * Waits for a Lambda function update to complete
 * @param {string} functionName - Lambda function name
 * @returns {Promise<void>}
 */
async function waitForLambdaUpdate(functionName) {
  logStatus(`Waiting for Lambda update to complete...`);
  let isUpdating = true;
  let retries = 0;
  const maxRetries = 30; // Maximum 30 retries (30 seconds)
  
  while (isUpdating && retries < maxRetries) {
    try {
      const result = await runCommand(() => lambdaClient.send(new GetFunctionCommand({
        FunctionName: functionName
      })));
      
      // Check Lambda state - if it's Active, the update has completed
      const state = result.Configuration.State;
      if (state === 'Active') {
        isUpdating = false;
        logStatus(`Lambda update completed (${retries + 1} attempts)`);
      } else {
        logStatus(`Lambda is still updating (${state}), waiting...`);
        retries++;
        // Wait for 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  if (retries >= maxRetries) {
    logStatus(`Warning: Lambda update check timed out after ${maxRetries} attempts`);
  }
}

/**
 * Updates Lambda environment variables with retry mechanism
 * @param {string} functionName - Lambda function name
 * @param {Object} envVars - Environment variables to set
 * @returns {Promise<boolean>} - Success status
 */
async function updateLambdaEnvironmentWithRetry(functionName, envVars) {
  const maxRetries = 3;
  const retryDelay = 10000; // 10 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get current Lambda configuration
      const lambdaConfig = await runCommand(() => lambdaClient.send(new GetFunctionCommand({
        FunctionName: functionName
      })));
      
      // Merge existing environment variables with new ones
      const currentVars = lambdaConfig.Configuration.Environment?.Variables || {};
      const updatedVars = { ...currentVars, ...envVars };
      
      // Update Lambda configuration with new environment variables
      await runCommand(() => lambdaClient.send(new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: {
          Variables: updatedVars
        }
      })));
      
      logStatus(`Lambda environment variables updated successfully (attempt ${attempt})`);
      return true;
    } catch (error) {
      const isUpdateInProgressError = error.message && 
        error.message.includes('The operation cannot be performed at this time') &&
        error.message.includes('An update is in progress');
      
      if (isUpdateInProgressError && attempt < maxRetries) {
        logStatus(`Update in progress, retrying in ${retryDelay/1000} seconds... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else if (isUpdateInProgressError) {
        logStatus(`Failed to update environment variables after ${maxRetries} attempts`);
        return false;
      } else {
        // Some other error occurred
        throw error;
      }
    }
  }
  
  return false;
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
          // First update the Lambda code
          logStatus(`Updating Lambda function code: ${functionName}`);
          await runCommand(() => lambdaClient.send(new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            S3Bucket: config.deploymentBucket,
            S3Key: 'lambda-package.zip',
            Publish: true
          })));
          
          // Generate new build number for this deployment
          const buildNumber = generateBuildNumber();
          logStatus(`Setting build number: ${buildNumber}`);
          logStatus(`Setting server URL: ${config.serverLabel}`);
          
          // Then update environment variables with retry logic
          const envUpdateSuccess = await updateLambdaEnvironmentWithRetry(
            functionName, 
            { 
              LATEST_BUILD: buildNumber,
              LAST_SERVER: config.serverLabel
            }
          );
          
          if (envUpdateSuccess) {
            logStatus(`Build number ${buildNumber} set successfully`);
          } else {
            logStatus(`Warning: Could not update build number. Lambda function code was updated.`);
          }
          
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
  const includeFilePath = config.includeFile;
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
  
  const templateBody = await readFile(config.templateFile, 'utf8');
  
  // Read environment variables from .env file for initial deployment
  const envVars = await readEnvFile();
  
  console.log(`${colors.yellow}Deploying stack with environment variables (this may take several minutes)...${colors.reset}`);
  
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
  
  // Get Lambda function name from stack outputs after creation
  const outputs = await getStackOutputs();
  const functionName = outputs.find(o => o.OutputKey === 'LambdaFunctionName')?.OutputValue;
  
  if (functionName && Object.keys(envVars).length > 0) {
    // Update Lambda environment variables after stack creation
    logStatus("Setting Lambda environment variables from .env file...");
    await updateLambdaEnvironment(functionName, envVars);
  }
  
  logStatus("Stack creation completed successfully");
}

/**
 * Reads the .env file and returns environment variables as an object
 * @returns {Promise<Object>} Environment variables
 */
async function readEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = await readFile(envPath, 'utf8');
    
    // Parse .env file
    const envVars = {};
    const lines = envContent.split('\n');
    
    // List of variables we want to include
    const includedVars = [
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'LLM_MODEL',
      'GAS_DIRECTORY',
      // Add other variables you want to include
    ];
    
    for (const line of lines) {
      // Skip empty lines and comments
      if (!line || line.trim().startsWith('#')) continue;
      
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        // Only include specific variables to avoid transferring unnecessary config
        if (includedVars.includes(key)) {
          let value = match[2] || '';
          // Remove quotes if present
          value = value.replace(/^['"]|['"]$/g, '');
          envVars[key] = value;
        }
      }
    }
    
    return envVars;
  } catch (error) {
    console.warn(`${colors.yellow}Warning: Could not read .env file: ${error.message}${colors.reset}`);
    return {};
  }
}

/**
 * Updates Lambda environment variables
 * @param {string} functionName - Lambda function name
 * @param {Object} envVars - Environment variables to set
 */
async function updateLambdaEnvironment(functionName, envVars) {
  try {
    // Get current Lambda configuration
    const lambdaConfig = await runCommand(() => lambdaClient.send(new GetFunctionCommand({
      FunctionName: functionName
    })));
    
    // Add build number to environment variables
    const buildNumber = generateBuildNumber();
    envVars.LATEST_BUILD = buildNumber;
    envVars.LAST_SERVER = config.serverLabel;
    logStatus(`Setting build number: ${buildNumber}`);
    logStatus(`Setting server URL: ${config.serverLabel}`);
    
    // Merge existing environment variables with new ones
    const currentVars = lambdaConfig.Configuration.Environment?.Variables || {};
    const updatedVars = { ...currentVars, ...envVars };
    
    // Update Lambda configuration with new environment variables
    await runCommand(() => lambdaClient.send(new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Environment: {
        Variables: updatedVars
      }
    })));
    
    logStatus("Lambda environment variables updated successfully");
  } catch (error) {
    console.error(`${colors.red}Error updating Lambda environment variables: ${error.message}${colors.reset}`);
  }
}

/**
 * Updates the full CloudFormation stack
 */
async function updateFullStack() {
  logStatus("Updating CloudFormation stack...");
  
  const templateBody = await readFile(config.templateFile, 'utf8');
  
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
  
  let functionUrl;
  
  try {
    // Check if function URL already exists
    const urlConfig = await lambdaClient.send(new GetFunctionUrlConfigCommand({
      FunctionName: functionName
    }));
    
    functionUrl = urlConfig.FunctionUrl;
    logStatus(`Function URL exists: ${functionUrl}`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Create function URL
      logStatus("Creating new function URL...");
      const response = await runCommand(() => lambdaClient.send(new CreateFunctionUrlConfigCommand({
        FunctionName: functionName,
        AuthType: 'NONE'
      })));
      
      functionUrl = response.FunctionUrl;
      logStatus(`Created function URL: ${functionUrl}`);
    } else {
      throw error;
    }
  }
  
  // Always ensure permissions are set correctly, regardless of whether URL was just created or already existed
  try {
    // Check if policy exists
    await lambdaClient.send(new GetPolicyCommand({
      FunctionName: functionName
    }));
    
    logStatus("Function URL permissions already exist");
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Policy doesn't exist, add it
      logStatus("Adding permission for public access to function URL...");
      await runCommand(() => lambdaClient.send(new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: 'FunctionURLAllowPublicAccess',
        Action: 'lambda:InvokeFunctionUrl',
        Principal: '*',
        FunctionUrlAuthType: 'NONE'
      })));
      
      logStatus("Function URL public access permission added");
    } else {
      throw error;
    }
  }
  
  return functionUrl;
}

// Run the deployment
deploy(); 