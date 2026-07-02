const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Portfolio API',
      version: '1.3.0',
      description: 'API for contact submissions, admin sessions, queue operations, telemetry, diagnostics, and runtime metadata.',
      contact: {
        name: 'Soeraj Balak',
        email: 'soeraj_balak@hotmail.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://portfolio.example.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'HTTP Basic authentication for admin login and optional message access'
        },
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'HTTP session cookie'
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description: 'CSRF token for state-changing operations'
        }
      },
      schemas: {
        ContactMessage: {
          type: 'object',
          required: ['name', 'email', 'subject', 'message'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Sender name'
            },
            email: {
              type: 'string',
              format: 'email',
              maxLength: 254,
              description: 'Sender email address'
            },
            subject: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
              description: 'Message subject'
            },
            message: {
              type: 'string',
              minLength: 1,
              maxLength: 10000,
              description: 'Message content'
            },
            website: {
              type: 'string',
              description: 'Honeypot field (should be empty)'
            }
          }
        },
        AdminSession: {
          type: 'object',
          properties: {
            authenticated: {
              type: 'boolean',
              description: 'Whether user is authenticated'
            },
            userId: {
              type: 'string',
              description: 'Authenticated user ID'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              description: 'Error message'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              description: 'Success message'
            },
            data: {
              type: 'object',
              description: 'Response data'
            }
          }
        }
      }
    }
  },
  apis: ['./server.js', './backend/node/routes/*.js']
};

module.exports = swaggerJsdoc(options);
