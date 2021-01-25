"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendStack = void 0;
const cdk = require("@aws-cdk/core");
const lambda = require("@aws-cdk/aws-lambda");
const appsync = require("@aws-cdk/aws-appsync");
const events = require("@aws-cdk/aws-events");
const eventsTargets = require("@aws-cdk/aws-events-targets");
const dynamoDB = require("@aws-cdk/aws-dynamodb");
const cognito = require("@aws-cdk/aws-cognito");
const cloudfront = require("@aws-cdk/aws-cloudfront");
const origins = require("@aws-cdk/aws-cloudfront-origins");
const s3 = require("@aws-cdk/aws-s3");
const s3deploy = require("@aws-cdk/aws-s3-deployment");
const appsync_request_response_1 = require("../utils/appsync-request-response");
class BackendStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        //Here we define our Authentication via google
        const userPool = new cognito.UserPool(this, "TodosGoogleUserPool", {
            selfSignUpEnabled: true,
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            userVerification: { emailStyle: cognito.VerificationEmailStyle.CODE },
            autoVerify: { email: true },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
            },
        });
        const provider = new cognito.UserPoolIdentityProviderGoogle(this, "googleProvider", {
            userPool: userPool,
            clientId: "946189751283-qar9hmgh34n2k95g99bj5t21q92u612u.apps.googleusercontent.com",
            clientSecret: "vs2NiWOpk3qAdVpyS5RIdKZH",
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                phoneNumber: cognito.ProviderAttribute.GOOGLE_PHONE_NUMBERS,
            },
            scopes: ["profile", "email", "openid"],
        });
        userPool.registerIdentityProvider(provider);
        const userPoolClient = new cognito.UserPoolClient(this, "todoamplifyClient", {
            userPool,
            oAuth: {
                callbackUrls: ["https://dd7ec0n7fuvn7.cloudfront.net/"],
                logoutUrls: ["https://dd7ec0n7fuvn7.cloudfront.net/"],
            },
        });
        const domain = userPool.addDomain("Todosdomain", {
            cognitoDomain: {
                domainPrefix: "muhib-todos",
            },
        });
        new cdk.CfnOutput(this, "aws_user_pools_web_client_id", {
            value: userPoolClient.userPoolClientId,
        });
        new cdk.CfnOutput(this, "aws_project_region", {
            value: this.region,
        });
        new cdk.CfnOutput(this, "aws_user_pools_id", {
            value: userPool.userPoolId,
        });
        new cdk.CfnOutput(this, "domain", {
            value: domain.domainName,
        });
        // Appsync API for todo app schema
        const Todoapi = new appsync.GraphqlApi(this, "ApiForTodo", {
            name: "appsyncEventbridgeAPITodo",
            schema: appsync.Schema.fromAsset("utils/schema.gql"),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: appsync.AuthorizationType.API_KEY,
                },
            },
            xrayEnabled: true,
        });
        // Prints out the AppSync GraphQL endpoint to the terminal
        new cdk.CfnOutput(this, "todoURL", {
            value: Todoapi.graphqlUrl
        });
        // Prints out the AppSync GraphQL API key to the terminal
        new cdk.CfnOutput(this, "TodoApiKey", {
            value: Todoapi.apiKey || ''
        });
        // Prints out the AppSync Api to the terminal
        new cdk.CfnOutput(this, "TodoAPI-ID", {
            value: Todoapi.apiId || ''
        });
        // Create new DynamoDB Table for Todos
        const TodoAppTable = new dynamoDB.Table(this, 'TodAppTable', {
            tableName: "TodoTable",
            partitionKey: {
                name: 'id',
                type: dynamoDB.AttributeType.STRING,
            },
        });
        // DynamoDB as a Datasource for the Graphql API.
        const TodoAppDS = Todoapi.addDynamoDbDataSource('TodoAppDataSource', TodoAppTable);
        ////////////////////////////// Creating Lambda handler //////////////////////
        const dynamoHandlerLambda = new lambda.Function(this, 'Dynamo_Handler', {
            code: lambda.Code.fromAsset('lambda'),
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'dynamoHandler.handler',
            environment: {
                DYNAMO_TABLE_NAME: TodoAppTable.tableName,
            },
        });
        // Giving Table access to dynamoHandlerLambda
        TodoAppTable.grantReadWriteData(dynamoHandlerLambda);
        TodoAppDS.createResolver({
            typeName: "Query",
            fieldName: 'getTodos',
            requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
            responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
        });
        // HTTP as Datasource for the Graphql API
        const httpEventTriggerDS = Todoapi.addHttpDataSource("eventTriggerDS", "https://events." + this.region + ".amazonaws.com/", // This is the ENDPOINT for eventbridge.
        {
            name: "httpDsWithEventBridge",
            description: "From Appsync to Eventbridge",
            authorizationConfig: {
                signingRegion: this.region,
                signingServiceName: "events",
            },
        });
        /* Mutation */
        const mutations = ["addTodo", "deleteTodo",];
        mutations.forEach((mut) => {
            let details = `\\\"todoId\\\": \\\"$ctx.args.todoId\\\"`;
            if (mut === 'addTodo') {
                details = `\\\"title\\\":\\\"$ctx.args.todo.title\\\" , \\\"user\\\":\\\"$ctx.args.todo.user\\\"`;
            }
            else if (mut === "deleteTodo") {
                details = `\\\"todoId\\\":\\\"$ctx.args.todoId\\\"`;
            }
            httpEventTriggerDS.createResolver({
                typeName: "Mutation",
                fieldName: mut,
                requestMappingTemplate: appsync.MappingTemplate.fromString(appsync_request_response_1.requestTemplate(details, mut)),
                responseMappingTemplate: appsync.MappingTemplate.fromString(appsync_request_response_1.responseTemplate()),
            });
        });
        events.EventBus.grantPutEvents(httpEventTriggerDS);
        ////////// Creating rule to invoke step function on event ///////////////////////
        new events.Rule(this, "eventConsumerRule", {
            eventPattern: {
                source: [appsync_request_response_1.EVENT_SOURCE],
            },
            targets: [new eventsTargets.LambdaFunction(dynamoHandlerLambda)]
        });
        //here I define s3 bucket 
        const todosBucket = new s3.Bucket(this, "todosBucket", {
            versioned: true,
        });
        todosBucket.grantPublicAccess(); // website visible to all.
        // create a CDN to deploy your website
        const distribution = new cloudfront.Distribution(this, "TodosDistribution", {
            defaultBehavior: {
                origin: new origins.S3Origin(todosBucket),
            },
            defaultRootObject: "index.html",
        });
        // Prints out the web endpoint to the terminal
        new cdk.CfnOutput(this, "DistributionDomainName", {
            value: distribution.domainName,
        });
        // housekeeping for uploading the data in bucket 
        new s3deploy.BucketDeployment(this, "DeployTodoApp", {
            sources: [s3deploy.Source.asset("../frontend/public")],
            destinationBucket: todosBucket,
            distribution,
            distributionPaths: ["/*"],
        });
    }
}
exports.BackendStack = BackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJhY2tlbmQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUNBQXFDO0FBQ3JDLDhDQUE4QztBQUM5QyxnREFBZ0Q7QUFDaEQsOENBQThDO0FBQzlDLDZEQUE2RDtBQUM3RCxrREFBa0Q7QUFDbEQsZ0RBQWdEO0FBQ2hELHNEQUFzRDtBQUN0RCwyREFBMkQ7QUFDM0Qsc0NBQXNDO0FBQ3RDLHVEQUF1RDtBQUN2RCxnRkFBb0c7QUFFcEcsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qiw4Q0FBOEM7UUFDOUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNqRSxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLFVBQVU7WUFDbkQsZ0JBQWdCLEVBQUUsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRTtZQUNyRSxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1lBQzNCLGtCQUFrQixFQUFFO2dCQUNsQixLQUFLLEVBQUU7b0JBQ0wsUUFBUSxFQUFFLElBQUk7b0JBQ2QsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLDhCQUE4QixDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFDaEY7WUFDRSxRQUFRLEVBQUUsUUFBUTtZQUNsQixRQUFRLEVBQUUsMEVBQTBFO1lBQ3BGLFlBQVksRUFBRSwwQkFBMEI7WUFDeEMsZ0JBQWdCLEVBQUU7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QUFZLEdBQUcsSUFBSSxVQUFVLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMxRSxlQUFlLEVBQUU7Z0JBQ2YsTUFBTSxFQUFFLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7YUFDMUM7WUFDRCxpQkFBaUIsRUFBRSxZQUFZO1NBQ2hDLENBQUMsQ0FBQztRQUdILDhDQUE4QztRQUM5QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQ2hELEtBQUssRUFBRSxZQUFZLENBQUMsVUFBVTtTQUMvQixDQUFDLENBQUM7UUFHSCxpREFBaUQ7UUFDakQsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNuRCxPQUFPLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3RELGlCQUFpQixFQUFFLFdBQVc7WUFDOUIsWUFBWTtZQUNaLGlCQUFpQixFQUFFLENBQUMsSUFBSSxDQUFDO1NBQzFCLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWpNRCxvQ0FpTUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnQGF3cy1jZGsvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcHBzeW5jIGZyb20gJ0Bhd3MtY2RrL2F3cy1hcHBzeW5jJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdAYXdzLWNkay9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIGV2ZW50c1RhcmdldHMgZnJvbSAnQGF3cy1jZGsvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGR5bmFtb0RCIGZyb20gJ0Bhd3MtY2RrL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSBcIkBhd3MtY2RrL2F3cy1jbG91ZGZyb250XCI7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gXCJAYXdzLWNkay9hd3MtY2xvdWRmcm9udC1vcmlnaW5zXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzLWRlcGxveW1lbnRcIjtcbmltcG9ydCB7IHJlcXVlc3RUZW1wbGF0ZSwgcmVzcG9uc2VUZW1wbGF0ZSwgRVZFTlRfU09VUkNFIH0gZnJvbSAnLi4vdXRpbHMvYXBwc3luYy1yZXF1ZXN0LXJlc3BvbnNlJztcblxuZXhwb3J0IGNsYXNzIEJhY2tlbmRTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvL0hlcmUgd2UgZGVmaW5lIG91ciBBdXRoZW50aWNhdGlvbiB2aWEgZ29vZ2xlXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcIlRvZG9zR29vZ2xlVXNlclBvb2xcIiwge1xuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7IGVtYWlsU3R5bGU6IGNvZ25pdG8uVmVyaWZpY2F0aW9uRW1haWxTdHlsZS5DT0RFIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsIFwiZ29vZ2xlUHJvdmlkZXJcIixcbiAgICAgIHtcbiAgICAgICAgdXNlclBvb2w6IHVzZXJQb29sLFxuICAgICAgICBjbGllbnRJZDogXCI5NDYxODk3NTEyODMtcWFyOWhtZ2gzNG4yazk1Zzk5Ymo1dDIxcTkydTYxMnUuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb21cIixcbiAgICAgICAgY2xpZW50U2VjcmV0OiBcInZzMk5pV09wazNxQWRWcHlTNVJJZEtaSFwiLCAvLyBHb29nbGUgQ2xpZW50IFNlY3JldFxuICAgICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0VNQUlMLFxuICAgICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcbiAgICAgICAgICBwaG9uZU51bWJlcjogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfUEhPTkVfTlVNQkVSUyxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXCJwcm9maWxlXCIsIFwiZW1haWxcIiwgXCJvcGVuaWRcIl0sXG4gICAgICB9XG4gICAgKTtcbiAgICB1c2VyUG9vbC5yZWdpc3RlcklkZW50aXR5UHJvdmlkZXIocHJvdmlkZXIpO1xuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgXCJ0b2RvYW1wbGlmeUNsaWVudFwiLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGNhbGxiYWNrVXJsczogW1wiaHR0cHM6Ly9kZDdlYzBuN2Z1dm43LmNsb3VkZnJvbnQubmV0L1wiXSwgLy8gVGhpcyBpcyB3aGF0IHVzZXIgaXMgYWxsb3dlZCB0byBiZSByZWRpcmVjdGVkIHRvIHdpdGggdGhlIGNvZGUgdXBvbiBzaWduaW4uIHRoaXMgY2FuIGJlIGEgbGlzdCBvZiB1cmxzLlxuICAgICAgICBsb2dvdXRVcmxzOiBbXCJodHRwczovL2RkN2VjMG43ZnV2bjcuY2xvdWRmcm9udC5uZXQvXCJdLCAvLyBUaGlzIGlzIHdoYXQgdXNlciBpcyBhbGxvd2VkIHRvIGJlIHJlZGlyZWN0ZWQgdG8gYWZ0ZXIgc2lnbm91dC4gdGhpcyBjYW4gYmUgYSBsaXN0IG9mIHVybHMuXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgZG9tYWluID0gdXNlclBvb2wuYWRkRG9tYWluKFwiVG9kb3Nkb21haW5cIiwge1xuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IFwibXVoaWItdG9kb3NcIiwgLy8gU0VUIFlPVVIgT1dOIERvbWFpbiBQUkVGSVggSEVSRVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiYXdzX3VzZXJfcG9vbHNfd2ViX2NsaWVudF9pZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImF3c19wcm9qZWN0X3JlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5yZWdpb24sXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJhd3NfdXNlcl9wb29sc19pZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiZG9tYWluXCIsIHtcbiAgICAgIHZhbHVlOiBkb21haW4uZG9tYWluTmFtZSxcbiAgICB9KTtcblxuXG4gICAgLy8gQXBwc3luYyBBUEkgZm9yIHRvZG8gYXBwIHNjaGVtYVxuICAgIGNvbnN0IFRvZG9hcGkgPSBuZXcgYXBwc3luYy5HcmFwaHFsQXBpKHRoaXMsIFwiQXBpRm9yVG9kb1wiLCB7XG4gICAgICBuYW1lOiBcImFwcHN5bmNFdmVudGJyaWRnZUFQSVRvZG9cIixcbiAgICAgIHNjaGVtYTogYXBwc3luYy5TY2hlbWEuZnJvbUFzc2V0KFwidXRpbHMvc2NoZW1hLmdxbFwiKSxcbiAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgZGVmYXVsdEF1dGhvcml6YXRpb246IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBwc3luYy5BdXRob3JpemF0aW9uVHlwZS5BUElfS0VZLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHhyYXlFbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gUHJpbnRzIG91dCB0aGUgQXBwU3luYyBHcmFwaFFMIGVuZHBvaW50IHRvIHRoZSB0ZXJtaW5hbFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwidG9kb1VSTFwiLCB7XG4gICAgICB2YWx1ZTogVG9kb2FwaS5ncmFwaHFsVXJsXG4gICAgfSk7XG5cbiAgICAvLyBQcmludHMgb3V0IHRoZSBBcHBTeW5jIEdyYXBoUUwgQVBJIGtleSB0byB0aGUgdGVybWluYWxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlRvZG9BcGlLZXlcIiwge1xuICAgICAgdmFsdWU6IFRvZG9hcGkuYXBpS2V5IHx8ICcnXG4gICAgfSk7XG5cbiAgICAvLyBQcmludHMgb3V0IHRoZSBBcHBTeW5jIEFwaSB0byB0aGUgdGVybWluYWxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlRvZG9BUEktSURcIiwge1xuICAgICAgdmFsdWU6IFRvZG9hcGkuYXBpSWQgfHwgJydcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBuZXcgRHluYW1vREIgVGFibGUgZm9yIFRvZG9zXG4gICAgY29uc3QgVG9kb0FwcFRhYmxlID0gbmV3IGR5bmFtb0RCLlRhYmxlKHRoaXMsICdUb2RBcHBUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJUb2RvVGFibGVcIixcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnaWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9EQi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBhcyBhIERhdGFzb3VyY2UgZm9yIHRoZSBHcmFwaHFsIEFQSS5cbiAgICBjb25zdCBUb2RvQXBwRFMgPSBUb2RvYXBpLmFkZER5bmFtb0RiRGF0YVNvdXJjZSgnVG9kb0FwcERhdGFTb3VyY2UnLCBUb2RvQXBwVGFibGUpO1xuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vIENyZWF0aW5nIExhbWJkYSBoYW5kbGVyIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCBkeW5hbW9IYW5kbGVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRHluYW1vX0hhbmRsZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYScpLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiAnZHluYW1vSGFuZGxlci5oYW5kbGVyJyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIERZTkFNT19UQUJMRV9OQU1FOiBUb2RvQXBwVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICAvLyBHaXZpbmcgVGFibGUgYWNjZXNzIHRvIGR5bmFtb0hhbmRsZXJMYW1iZGFcbiAgICBUb2RvQXBwVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGR5bmFtb0hhbmRsZXJMYW1iZGEpO1xuXG4gICAgVG9kb0FwcERTLmNyZWF0ZVJlc29sdmVyKHtcbiAgICAgIHR5cGVOYW1lOiBcIlF1ZXJ5XCIsXG4gICAgICBmaWVsZE5hbWU6ICdnZXRUb2RvcycsXG4gICAgICByZXF1ZXN0TWFwcGluZ1RlbXBsYXRlOiBhcHBzeW5jLk1hcHBpbmdUZW1wbGF0ZS5keW5hbW9EYlNjYW5UYWJsZSgpLFxuICAgICAgcmVzcG9uc2VNYXBwaW5nVGVtcGxhdGU6IGFwcHN5bmMuTWFwcGluZ1RlbXBsYXRlLmR5bmFtb0RiUmVzdWx0TGlzdCgpLFxuICAgIH0pO1xuXG5cbiAgICAvLyBIVFRQIGFzIERhdGFzb3VyY2UgZm9yIHRoZSBHcmFwaHFsIEFQSVxuICAgIGNvbnN0IGh0dHBFdmVudFRyaWdnZXJEUyA9IFRvZG9hcGkuYWRkSHR0cERhdGFTb3VyY2UoXG4gICAgICBcImV2ZW50VHJpZ2dlckRTXCIsXG4gICAgICBcImh0dHBzOi8vZXZlbnRzLlwiICsgdGhpcy5yZWdpb24gKyBcIi5hbWF6b25hd3MuY29tL1wiLCAvLyBUaGlzIGlzIHRoZSBFTkRQT0lOVCBmb3IgZXZlbnRicmlkZ2UuXG4gICAgICB7XG4gICAgICAgIG5hbWU6IFwiaHR0cERzV2l0aEV2ZW50QnJpZGdlXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkZyb20gQXBwc3luYyB0byBFdmVudGJyaWRnZVwiLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgc2lnbmluZ1JlZ2lvbjogdGhpcy5yZWdpb24sXG4gICAgICAgICAgc2lnbmluZ1NlcnZpY2VOYW1lOiBcImV2ZW50c1wiLFxuICAgICAgICB9LFxuICAgICAgfVxuICAgICk7XG5cblxuICAgIC8qIE11dGF0aW9uICovXG4gICAgY29uc3QgbXV0YXRpb25zID0gW1wiYWRkVG9kb1wiLCBcImRlbGV0ZVRvZG9cIixdXG4gICAgbXV0YXRpb25zLmZvckVhY2goKG11dCkgPT4ge1xuICAgICAgbGV0IGRldGFpbHMgPSBgXFxcXFxcXCJ0b2RvSWRcXFxcXFxcIjogXFxcXFxcXCIkY3R4LmFyZ3MudG9kb0lkXFxcXFxcXCJgO1xuICAgICAgaWYgKG11dCA9PT0gJ2FkZFRvZG8nKSB7XG4gICAgICAgIGRldGFpbHMgPSBgXFxcXFxcXCJ0aXRsZVxcXFxcXFwiOlxcXFxcXFwiJGN0eC5hcmdzLnRvZG8udGl0bGVcXFxcXFxcIiAsIFxcXFxcXFwidXNlclxcXFxcXFwiOlxcXFxcXFwiJGN0eC5hcmdzLnRvZG8udXNlclxcXFxcXFwiYFxuICAgICAgfSBlbHNlIGlmIChtdXQgPT09IFwiZGVsZXRlVG9kb1wiKSB7XG4gICAgICAgIGRldGFpbHMgPSBgXFxcXFxcXCJ0b2RvSWRcXFxcXFxcIjpcXFxcXFxcIiRjdHguYXJncy50b2RvSWRcXFxcXFxcImBcbiAgICAgIH1cbiAgICAgIGh0dHBFdmVudFRyaWdnZXJEUy5jcmVhdGVSZXNvbHZlcih7XG4gICAgICAgIHR5cGVOYW1lOiBcIk11dGF0aW9uXCIsXG4gICAgICAgIGZpZWxkTmFtZTogbXV0LFxuICAgICAgICByZXF1ZXN0TWFwcGluZ1RlbXBsYXRlOiBhcHBzeW5jLk1hcHBpbmdUZW1wbGF0ZS5mcm9tU3RyaW5nKHJlcXVlc3RUZW1wbGF0ZShkZXRhaWxzLCBtdXQpKSxcbiAgICAgICAgcmVzcG9uc2VNYXBwaW5nVGVtcGxhdGU6IGFwcHN5bmMuTWFwcGluZ1RlbXBsYXRlLmZyb21TdHJpbmcocmVzcG9uc2VUZW1wbGF0ZSgpKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgZXZlbnRzLkV2ZW50QnVzLmdyYW50UHV0RXZlbnRzKGh0dHBFdmVudFRyaWdnZXJEUyk7XG5cbiAgICAvLy8vLy8vLy8vIENyZWF0aW5nIHJ1bGUgdG8gaW52b2tlIHN0ZXAgZnVuY3Rpb24gb24gZXZlbnQgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBuZXcgZXZlbnRzLlJ1bGUodGhpcywgXCJldmVudENvbnN1bWVyUnVsZVwiLCB7XG4gICAgICBldmVudFBhdHRlcm46IHtcbiAgICAgICAgc291cmNlOiBbRVZFTlRfU09VUkNFXSxcbiAgICAgIH0sXG4gICAgICB0YXJnZXRzOiBbbmV3IGV2ZW50c1RhcmdldHMuTGFtYmRhRnVuY3Rpb24oZHluYW1vSGFuZGxlckxhbWJkYSldXG4gICAgfSk7XG5cblxuICAgIC8vaGVyZSBJIGRlZmluZSBzMyBidWNrZXQgXG4gICAgY29uc3QgdG9kb3NCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwidG9kb3NCdWNrZXRcIiwge1xuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgdG9kb3NCdWNrZXQuZ3JhbnRQdWJsaWNBY2Nlc3MoKTsgLy8gd2Vic2l0ZSB2aXNpYmxlIHRvIGFsbC5cblxuICAgIC8vIGNyZWF0ZSBhIENETiB0byBkZXBsb3kgeW91ciB3ZWJzaXRlXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiVG9kb3NEaXN0cmlidXRpb25cIiwge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4odG9kb3NCdWNrZXQpLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiBcImluZGV4Lmh0bWxcIixcbiAgICB9KTtcblxuXG4gICAgLy8gUHJpbnRzIG91dCB0aGUgd2ViIGVuZHBvaW50IHRvIHRoZSB0ZXJtaW5hbFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRGlzdHJpYnV0aW9uRG9tYWluTmFtZVwiLCB7XG4gICAgICB2YWx1ZTogZGlzdHJpYnV0aW9uLmRvbWFpbk5hbWUsXG4gICAgfSk7XG5cblxuICAgIC8vIGhvdXNla2VlcGluZyBmb3IgdXBsb2FkaW5nIHRoZSBkYXRhIGluIGJ1Y2tldCBcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveVRvZG9BcHBcIiwge1xuICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldChcIi4uL2Zyb250ZW5kL3B1YmxpY1wiKV0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogdG9kb3NCdWNrZXQsXG4gICAgICBkaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogW1wiLypcIl0sXG4gICAgfSk7XG4gIH1cbn0iXX0=