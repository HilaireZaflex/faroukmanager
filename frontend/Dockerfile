FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY . .
ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
ENV GENERATE_SOURCEMAP=false
ENV INLINE_RUNTIME_CHUNK=false
RUN npm run build
RUN npm install -g serve
# Activer compression gzip sur le serveur serve
CMD ["serve", "-s", "build", "-l", "3000", "--no-clipboard"]
