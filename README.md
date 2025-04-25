# TestPilot Backend

A NestJS-based backend application that provides API services for TestPilot. This project uses modern technologies and follows best practices for building scalable and maintainable backend services.

## 🚀 Features

- RESTful API architecture
- Authentication and Authorization using JWT
- Integration with Supabase
- OpenAI integration
- Prolific API integration
- Product management
- Insights generation
- Test management

## 🛠️ Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: Supabase
- **Authentication**: JWT, Passport
- **AI Integration**: OpenAI
- **Testing**: Jest
- **Code Quality**: ESLint, Prettier
- **Containerization**: Docker

## 📦 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Docker (optional, for containerization)

## 🚀 Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd testpilot-be
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# JWT Configuration
JWT_SECRET=your_jwt_secret

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Prolific Configuration
PROLIFIC_API_KEY=your_prolific_api_key
```

## 🏃‍♂️ Running the Application

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

### Docker
```bash
docker build -t testpilot-be .
docker run -p 3000:3000 testpilot-be
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# e2e tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📁 Project Structure

```
src/
├── auth/           # Authentication module
├── insights/       # Insights generation module
├── lib/            # Shared libraries and utilities
├── open-ai/        # OpenAI integration
├── products/       # Product management
├── prolific/       # Prolific API integration
├── supabase/       # Supabase integration
├── tests/          # Test files
├── app.module.ts   # Main application module
├── app.controller.ts # Main controller
└── main.ts         # Application entry point
```

## 🔐 Authentication

The application uses JWT (JSON Web Tokens) for authentication. All protected routes require a valid JWT token in the Authorization header.

## 📚 API Documentation

API documentation is available at `/api` when running the application in development mode.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the UNLICENSED license.

## 👥 Authors

- Your Name/Team Name

## 📞 Support

For support, please contact [support contact information]