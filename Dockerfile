# Stage 1: Build
FROM public.ecr.aws/lambda/nodejs:22 AS builder

WORKDIR /build

# Copy files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tsconfig.json ./

# Install pnpm
RUN npm install -g corepack@latest && corepack enable

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile --aggregate-output

# Build the application
RUN pnpm run build

# Remove devDependencies for smaller image
RUN pnpm prune --prod

# Stage 2: Production
FROM public.ecr.aws/lambda/nodejs:22

ENV NODE_ENV=production

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package.json
COPY package.json ./

# Copy from builder
COPY --from=builder /build/built/ ./built/
COPY --from=builder /build/node_modules/ ./node_modules/

# Copy nsfw model
COPY nsfw-model/ ./nsfw-model/

# Set handler
CMD ["built/index.handler"]
