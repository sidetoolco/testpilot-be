# GitHub Actions Workflows

Este directorio contiene los workflows de GitHub Actions para el despliegue automático y manual de la aplicación.

## Workflows Disponibles

### 1. Manual GCP Deploy (workflow-dispatch.yml)

Este workflow permite desplegar manualmente la aplicación a diferentes ambientes.

#### Cómo Funciona:
1. **Trigger**: Se activa manualmente desde la pestaña "Actions" en GitHub
2. **Ambientes Disponibles**:
   - Development
   - Production

#### Pasos del Workflow:
1. 🛎️ **Checkout**: Obtiene el código del repositorio
2. 🔧 **Setup Node.js**: Configura Node.js 18
3. 📦 **Install Dependencies**: Instala las dependencias con `npm ci`
4. 🧪 **Run Tests**: Ejecuta las pruebas (SI LAS HAY)
5. 🏗️ **Build**: Construye la aplicación
6. 🔐 **GCP Auth**: Configura la autenticación de Google Cloud
7. 🧩 **Set Project**: Configura el proyecto de GCP
8. ⚙️ **Enable Services**: Habilita los servicios necesarios de GCP
9. 🚀 **Deploy**: Construye y despliega la aplicación en Cloud Run

### 2. Main Branch Workflow (main.yml)

Este workflow se ejecuta automáticamente en la rama main.

#### Cómo Funciona:
1. **Triggers**:
   - Push a la rama `main`
   - Pull requests a la rama `main`

#### Jobs:
1. **build-and-test**:
   - 🛎️ Checkout del código
   - 🔧 Setup de Node.js
   - 📦 Instalación de dependencias
   - 🧹 Ejecución del linter
   - 🧪 Ejecución de pruebas
   - 🏗️ Construcción de la aplicación

2. **deploy** (solo en push a main):
   - 🛎️ Checkout del código
   - 🔐 Configuración de GCP
   - 🧩 Configuración del proyecto
   - ⚙️ Habilitación de servicios
   - 🚀 Despliegue a Cloud Run

## Archivos de Construcción

### Dockerfile
El Dockerfile utiliza un enfoque multi-etapa para optimizar el tamaño final de la imagen:

1. **Etapa de Construcción**:
   ```dockerfile
   FROM node:18-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   ```
   - Usa Node.js 18 Alpine como base
   - Instala todas las dependencias
   - Copia el código fuente
   - Construye la aplicación

2. **Etapa de Producción**:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY --from=builder /app/dist ./dist
   EXPOSE 3000
   CMD ["node", "dist/main"]
   ```
   - Usa una imagen base más ligera
   - Solo instala dependencias de producción
   - Copia solo los archivos construidos
   - Expone el puerto 3000
   - Ejecuta la aplicación

### cloudbuild.yaml
El archivo cloudbuild.yaml define el proceso de construcción en Google Cloud Build:

1. **Pasos de Construcción**:
   ```yaml
   steps:
     - name: 'node:18'
       entrypoint: npm
       args: ['install']
     - name: 'node:18'
       entrypoint: npm
       args: ['run', 'build']
     - name: 'gcr.io/cloud-builders/docker'
       args: ['build', '-t', '${_IMAGE}', '-f', 'Dockerfile', '.']
     - name: 'gcr.io/cloud-builders/docker'
       args: ['push', '${_IMAGE}']
   ```
   - Instala dependencias
   - Construye la aplicación
   - Construye la imagen Docker
   - Publica la imagen en Artifact Registry

2. **Configuraciones**:
   - Usa máquina E2_HIGHCPU_8 para mejor rendimiento
   - Timeout de 30 minutos
   - Guarda artefactos en Google Cloud Storage

## Pruebas Locales

### 1. Construir la Imagen Docker Localmente
```bash
# Construir la imagen
docker build -t backend:local .

# Verificar que la imagen se creó
docker images | grep backend
```

### 2. Probar la Aplicación Localmente
```bash
# Ejecutar el contenedor
docker run -p 3000:3000 \
  -e SUPABASE_URL=your_supabase_url \
  -e SUPABASE_AUTH_KEY=your_supabase_key \
  -e AUTH0_DOMAIN=your_auth0_domain \
  -e AUTH0_CLIENT_ID=your_auth0_client_id \
  -e AUTH0_CLIENT_CERTIFICATE=your_auth0_certificate \
  backend:local
```

### 3. Probar Cloud Build Localmente
```bash
# Instalar Cloud Build local
gcloud components install cloud-build-local

# Ejecutar build local
cloud-build-local --config=cloudbuild.yaml \
  --dryrun=false \
  --substitutions=_IMAGE=backend:local
```

## Requisitos Previos

### Secretos de GitHub
Configurar los siguientes secretos en la configuración del repositorio:
- `GCP_SA_KEY`: Clave de la cuenta de servicio de GCP
- `GCP_PROJECT_ID`: ID del proyecto de GCP

### Configuración de GCP
1. Tener un proyecto en Google Cloud Platform
2. Habilitar los siguientes servicios:
   - Cloud Run
   - Artifact Registry
   - Secret Manager
3. Crear una cuenta de servicio con los permisos necesarios
4. Tener un archivo `cloudbuild.yaml` en la raíz del proyecto

## Cómo Usar

### Despliegue Manual
1. Ir a la pestaña "Actions" en GitHub
2. Seleccionar "Manual GCP Deploy"
3. Hacer clic en "Run workflow"
4. Seleccionar el ambiente deseado
5. Confirmar la ejecución

### Despliegue Automático
- Se ejecuta automáticamente al hacer push a main
- No requiere intervención manual
- Incluye pruebas y validaciones automáticas

## Estructura de Archivos
```
.github/
└── workflows/
    ├── README.md
    ├── workflow-dispatch.yml
    └── main.yml
```

## Notas Importantes
- El despliegue a producción solo ocurre desde la rama main
- Los pull requests solo ejecutan pruebas y validaciones
- Se requiere un archivo `cloudbuild.yaml` válido para la construcción de la imagen
- Los secretos deben estar correctamente configurados en GCP Secret Manager
- Las pruebas locales son importantes antes de hacer push a main 