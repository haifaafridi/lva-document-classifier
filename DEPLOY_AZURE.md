# Azure Container Apps deployment files

Copy Dockerfile, .dockerignore, and scripts/prefetchDeploymentModel.js into the root/current project exactly as instructed in ChatGPT.

The Docker image uses Node 22, installs Linux runtime libraries, runs npm ci, and bakes the production BGE model into /app/.hf-cache.

Secrets are intentionally NOT included.
