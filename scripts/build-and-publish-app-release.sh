#!/bin/bash
set -euo pipefail

# Check if the correct number of arguments are provided
if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <runtimeVersion> <xavia-ota-url> <upload-key>"
  exit 1
fi

# Get the current commit hash and message
commitHash=$(git rev-parse HEAD)
commitMessage=$(git log -1 --pretty=%B)
# Strip any credentials embedded in the remote URL before it leaves this machine
if ! repositoryUrl=$(git remote get-url origin 2>/dev/null); then
  echo "Error: origin remote is required for commit links." >&2
  exit 1
fi
repositoryUrl=$(printf '%s' "$repositoryUrl" | sed -E 's#://[^/@]+@#://#')

# Assign arguments to variables
runtimeVersion=$1
serverHost=$2
uploadKey=$3

# Generate a timestamp for the output folder
timestamp=$(date -u +%Y%m%d%H%M%S)
outputFolder="../ota-builds/$timestamp"
repoDir=$PWD

# Ask the user to confirm the hash, commit message, runtime version, and output folder
echo "Output Folder: $outputFolder"
echo "Runtime Version: $runtimeVersion"
echo "Commit Hash: $commitHash"
echo "Commit Message: $commitMessage"
echo "Repository: ${repositoryUrl:-none (no origin remote)}"

read -p "Do you want to proceed with these values? (y/n): " confirm

if [ "$confirm" != "y" ]; then
  echo "Operation cancelled by the user."
  exit 1
fi

rm -rf "$outputFolder"
mkdir -p "$outputFolder"

# Run expo export with the specified output folder
npx expo export --output-dir "$outputFolder"

# Extract expo config property from app.json and save to expoconfig.json
jq '.expo' app.json > "$outputFolder/expoconfig.json"


# Zip the output folder
cd "$outputFolder"
zip -q -r "${timestamp}.zip" .


# Upload the zip file to the server
curl --fail-with-body --show-error -X POST "$serverHost/api/upload" -F "file=@${timestamp}.zip" -F "runtimeVersion=$runtimeVersion" -F "commitHash=$commitHash" -F "commitMessage=$commitMessage" -F "repositoryUrl=$repositoryUrl" -F "uploadKey=$uploadKey"

echo ""

echo "Uploaded to $serverHost/api/upload"
cd "$repoDir"

# Remove the output folder and zip file
rm -rf "$outputFolder"

echo "Removed $outputFolder"
echo "Done"
