#!/bin/bash

# Ensure we're on main branch and up-to-date
git checkout main
git pull origin main

# Get the current version from package.json
current_version=$(node -p "require('./package.json').version")

# Increment version and update changelog
# You can pass major, minor, or patch as an argument
increment_type=${1:-patch}

# standard-version will:
# 1. Bump version in package.json
# 2. Update CHANGELOG.md
# 3. Commit changes with message "chore(release): {new_version}"
# 4. Create git tag "v{new_version}"
npx standard-version --release-as $increment_type

# Get the new version
new_version=$(node -p "require('./package.json').version")

# Push both the commit and the tag that standard-version created
git push --follow-tags origin main

echo "Released version v$new_version" 