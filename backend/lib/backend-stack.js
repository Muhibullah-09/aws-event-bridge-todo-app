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
                callbackUrls: ["https://d20f4mcjylrx1z.cloudfront.net/"],
                logoutUrls: ["https://d20f4mcjylrx1z.cloudfront.net/"],
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
        new cdk.CfnOutput(this, "TodoAPIID", {
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
        events.EventBus.grantPutEvents(httpEventTriggerDS);
        ////////////////////////////// Creating Lambda handler ////////////////////////
        /* lambda 1 */
        const dynamoHandlerLambda = new lambda.Function(this, 'Dynamo_Handler', {
            code: lambda.Code.fromAsset('lambda'),
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'dynamoHandler.handler',
            environment: {
                DYNAMO_TABLE_NAME: TodoAppTable.tableName,
            },
        });
        // Giving Table access to dynamoHandlerLambda
        TodoAppTable.grantFullAccess(dynamoHandlerLambda);
        TodoAppDS.createResolver({
            typeName: "Query",
            fieldName: 'getTodos',
            requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
            responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
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
            sources: [s3deploy.Source.asset("../todo-frontend/public")],
            destinationBucket: todosBucket,
            distribution,
            distributionPaths: ["/*"],
        });
    }
}
exports.BackendStack = BackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJhY2tlbmQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUNBQXFDO0FBQ3JDLDhDQUE4QztBQUM5QyxnREFBZ0Q7QUFDaEQsOENBQThDO0FBQzlDLDZEQUE2RDtBQUM3RCxrREFBa0Q7QUFDbEQsZ0RBQWdEO0FBQ2hELHNEQUFzRDtBQUN0RCwyREFBMkQ7QUFDM0Qsc0NBQXNDO0FBQ3RDLHVEQUF1RDtBQUN2RCxnRkFBb0c7QUFFcEcsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ2pFLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlLENBQUMsVUFBVTtZQUNuRCxnQkFBZ0IsRUFBRSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsc0JBQXNCLENBQUMsSUFBSSxFQUFFO1lBQ3JFLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7WUFDM0Isa0JBQWtCLEVBQUU7Z0JBQ2xCLEtBQUssRUFBRTtvQkFDTCxRQUFRLEVBQUUsSUFBSTtvQkFDZCxPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsOEJBQThCLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUNoRjtZQUNFLFFBQVEsRUFBRSxRQUFRO1lBQ2xCLFFBQVEsRUFBRSwwRUFBMEU7WUFDcEYsWUFBWSxFQUFFLDBCQUEwQjtZQUN4QyxnQkFBZ0IsRUFBRTtnQkFDaEIsS0FBSyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZO2dCQUM3QyxTQUFTLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQjtnQkFDdEQsV0FBVyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0I7YUFDNUQ7WUFDRCxNQUFNLEVBQUUsQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQztTQUN2QyxDQUNGLENBQUM7UUFDRixRQUFRLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsTUFBTSxjQUFjLEdBQUcsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzRSxRQUFRO1lBQ1IsS0FBSyxFQUFFO2dCQUNMLFlBQVksRUFBRSxDQUFDLHdDQUF3QyxDQUFDO2dCQUN4RCxVQUFVLEVBQUUsQ0FBQyx3Q0FBd0MsQ0FBQzthQUN2RDtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFO1lBQy9DLGFBQWEsRUFBRTtnQkFDYixZQUFZLEVBQUUsYUFBYTthQUM1QjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsOEJBQThCLEVBQUU7WUFDdEQsS0FBSyxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0I7U0FDdkMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU07U0FDbkIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDaEMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxVQUFVO1NBQ3pCLENBQUMsQ0FBQztRQUdILGtDQUFrQztRQUNsQyxNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN6RCxJQUFJLEVBQUUsMkJBQTJCO1lBQ2pDLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQztZQUNwRCxtQkFBbUIsRUFBRTtnQkFDbkIsb0JBQW9CLEVBQUU7b0JBQ3BCLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO2lCQUNyRDthQUNGO1lBQ0QsV0FBVyxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDO1FBRUgsMERBQTBEO1FBQzFELElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ2pDLEtBQUssRUFBRSxPQUFPLENBQUMsVUFBVTtTQUMxQixDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNLElBQUksRUFBRTtTQUM1QixDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRTtTQUMzQixDQUFDLENBQUM7UUFFSCxzQ0FBc0M7UUFDdEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDM0QsU0FBUyxFQUFFLFdBQVc7WUFDdEIsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxJQUFJO2dCQUNWLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7U0FDRixDQUFDLENBQUM7UUFFSCxnREFBZ0Q7UUFDaEQsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLG1CQUFtQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRW5GLHlDQUF5QztRQUN6QyxNQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FDbEQsZ0JBQWdCLEVBQ2hCLGlCQUFpQixHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsaUJBQWlCLEVBQUUsd0NBQXdDO1FBQzdGO1lBQ0UsSUFBSSxFQUFFLHVCQUF1QjtZQUM3QixXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLG1CQUFtQixFQUFFO2dCQUNuQixhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU07Z0JBQzFCLGtCQUFrQixFQUFFLFFBQVE7YUFDN0I7U0FDRixDQUNGLENBQUM7UUFDRixNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRW5ELCtFQUErRTtRQUMvRSxjQUFjO1FBQ2QsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3RFLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7WUFDckMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsdUJBQXVCO1lBQ2hDLFdBQVcsRUFBRTtnQkFDWCxpQkFBaUIsRUFBRSxZQUFZLENBQUMsU0FBUzthQUMxQztTQUNGLENBQUMsQ0FBQztRQUNILDZDQUE2QztRQUM3QyxZQUFZLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFbEQsU0FBUyxDQUFDLGNBQWMsQ0FBQztZQUN2QixRQUFRLEVBQUUsT0FBTztZQUNqQixTQUFTLEVBQUUsVUFBVTtZQUNyQixzQkFBc0IsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLGlCQUFpQixFQUFFO1lBQ25FLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyxlQUFlLENBQUMsa0JBQWtCLEVBQUU7U0FDdEUsQ0FBQyxDQUFDO1FBRUgsY0FBYztRQUNkLE1BQU0sU0FBUyxHQUFHLENBQUMsU0FBUyxFQUFFLFlBQVksRUFBRSxDQUFBO1FBQzVDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUN4QixJQUFJLE9BQU8sR0FBRywwQ0FBMEMsQ0FBQztZQUN6RCxJQUFJLEdBQUcsS0FBSyxTQUFTLEVBQUU7Z0JBQ3JCLE9BQU8sR0FBRyx1RkFBdUYsQ0FBQTthQUNsRztpQkFBTSxJQUFJLEdBQUcsS0FBSyxZQUFZLEVBQUU7Z0JBQy9CLE9BQU8sR0FBRyx5Q0FBeUMsQ0FBQTthQUNwRDtZQUNELGtCQUFrQixDQUFDLGNBQWMsQ0FBQztnQkFDaEMsUUFBUSxFQUFFLFVBQVU7Z0JBQ3BCLFNBQVMsRUFBRSxHQUFHO2dCQUNkLHNCQUFzQixFQUFFLE9BQU8sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLDBDQUFlLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUN6Rix1QkFBdUIsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQywyQ0FBZ0IsRUFBRSxDQUFDO2FBQ2hGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsaUZBQWlGO1FBQ2pGLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDekMsWUFBWSxFQUFFO2dCQUNaLE1BQU0sRUFBRSxDQUFDLHVDQUFZLENBQUM7YUFDdkI7WUFDRCxPQUFPLEVBQUUsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsQ0FBQztTQUNqRSxDQUFDLENBQUM7UUFHSCwwQkFBMEI7UUFDMUIsTUFBTSxXQUFXLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckQsU0FBUyxFQUFFLElBQUk7U0FDaEIsQ0FBQyxDQUFDO1FBRUgsV0FBVyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQywwQkFBMEI7UUFFM0Qsc0NBQXNDO1FBQ3RDLE1BQU0sWUFBWSxHQUFHLElBQUksVUFBVSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDMUUsZUFBZSxFQUFFO2dCQUNmLE1BQU0sRUFBRSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO2FBQzFDO1lBQ0QsaUJBQWlCLEVBQUUsWUFBWTtTQUNoQyxDQUFDLENBQUM7UUFHSCw4Q0FBOEM7UUFDOUMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsWUFBWSxDQUFDLFVBQVU7U0FDL0IsQ0FBQyxDQUFDO1FBR0gsaURBQWlEO1FBQ2pELElBQUksUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbkQsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUMzRCxpQkFBaUIsRUFBRSxXQUFXO1lBQzlCLFlBQVk7WUFDWixpQkFBaUIsRUFBRSxDQUFDLElBQUksQ0FBQztTQUMxQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5TEQsb0NBOExDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBwc3luYyBmcm9tICdAYXdzLWNkay9hd3MtYXBwc3luYyc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnQGF3cy1jZGsvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyBldmVudHNUYXJnZXRzIGZyb20gJ0Bhd3MtY2RrL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9EQiBmcm9tICdAYXdzLWNkay9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdAYXdzLWNkay9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gXCJAYXdzLWNkay9hd3MtY2xvdWRmcm9udFwiO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tIFwiQGF3cy1jZGsvYXdzLWNsb3VkZnJvbnQtb3JpZ2luc1wiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSBcIkBhd3MtY2RrL2F3cy1zMy1kZXBsb3ltZW50XCI7XG5pbXBvcnQgeyByZXF1ZXN0VGVtcGxhdGUsIHJlc3BvbnNlVGVtcGxhdGUsIEVWRU5UX1NPVVJDRSB9IGZyb20gJy4uL3V0aWxzL2FwcHN5bmMtcmVxdWVzdC1yZXNwb25zZSc7XG5cbmV4cG9ydCBjbGFzcyBCYWNrZW5kU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcIlRvZG9zR29vZ2xlVXNlclBvb2xcIiwge1xuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7IGVtYWlsU3R5bGU6IGNvZ25pdG8uVmVyaWZpY2F0aW9uRW1haWxTdHlsZS5DT0RFIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsIFwiZ29vZ2xlUHJvdmlkZXJcIixcbiAgICAgIHtcbiAgICAgICAgdXNlclBvb2w6IHVzZXJQb29sLFxuICAgICAgICBjbGllbnRJZDogXCI5NDYxODk3NTEyODMtcWFyOWhtZ2gzNG4yazk1Zzk5Ymo1dDIxcTkydTYxMnUuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb21cIixcbiAgICAgICAgY2xpZW50U2VjcmV0OiBcInZzMk5pV09wazNxQWRWcHlTNVJJZEtaSFwiLCAvLyBHb29nbGUgQ2xpZW50IFNlY3JldFxuICAgICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0VNQUlMLFxuICAgICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcbiAgICAgICAgICBwaG9uZU51bWJlcjogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfUEhPTkVfTlVNQkVSUyxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXCJwcm9maWxlXCIsIFwiZW1haWxcIiwgXCJvcGVuaWRcIl0sXG4gICAgICB9XG4gICAgKTtcbiAgICB1c2VyUG9vbC5yZWdpc3RlcklkZW50aXR5UHJvdmlkZXIocHJvdmlkZXIpO1xuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgXCJ0b2RvYW1wbGlmeUNsaWVudFwiLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGNhbGxiYWNrVXJsczogW1wiaHR0cHM6Ly9kMjBmNG1janlscngxei5jbG91ZGZyb250Lm5ldC9cIl0sIC8vIFRoaXMgaXMgd2hhdCB1c2VyIGlzIGFsbG93ZWQgdG8gYmUgcmVkaXJlY3RlZCB0byB3aXRoIHRoZSBjb2RlIHVwb24gc2lnbmluLiB0aGlzIGNhbiBiZSBhIGxpc3Qgb2YgdXJscy5cbiAgICAgICAgbG9nb3V0VXJsczogW1wiaHR0cHM6Ly9kMjBmNG1janlscngxei5jbG91ZGZyb250Lm5ldC9cIl0sIC8vIFRoaXMgaXMgd2hhdCB1c2VyIGlzIGFsbG93ZWQgdG8gYmUgcmVkaXJlY3RlZCB0byBhZnRlciBzaWdub3V0LiB0aGlzIGNhbiBiZSBhIGxpc3Qgb2YgdXJscy5cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBkb21haW4gPSB1c2VyUG9vbC5hZGREb21haW4oXCJUb2Rvc2RvbWFpblwiLCB7XG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogXCJtdWhpYi10b2Rvc1wiLCAvLyBTRVQgWU9VUiBPV04gRG9tYWluIFBSRUZJWCBIRVJFXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJhd3NfdXNlcl9wb29sc193ZWJfY2xpZW50X2lkXCIsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiYXdzX3Byb2plY3RfcmVnaW9uXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcbiAgICB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImF3c191c2VyX3Bvb2xzX2lkXCIsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJkb21haW5cIiwge1xuICAgICAgdmFsdWU6IGRvbWFpbi5kb21haW5OYW1lLFxuICAgIH0pO1xuXG5cbiAgICAvLyBBcHBzeW5jIEFQSSBmb3IgdG9kbyBhcHAgc2NoZW1hXG4gICAgY29uc3QgVG9kb2FwaSA9IG5ldyBhcHBzeW5jLkdyYXBocWxBcGkodGhpcywgXCJBcGlGb3JUb2RvXCIsIHtcbiAgICAgIG5hbWU6IFwiYXBwc3luY0V2ZW50YnJpZGdlQVBJVG9kb1wiLFxuICAgICAgc2NoZW1hOiBhcHBzeW5jLlNjaGVtYS5mcm9tQXNzZXQoXCJ1dGlscy9zY2hlbWEuZ3FsXCIpLFxuICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICBkZWZhdWx0QXV0aG9yaXphdGlvbjoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcHBzeW5jLkF1dGhvcml6YXRpb25UeXBlLkFQSV9LRVksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgeHJheUVuYWJsZWQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBQcmludHMgb3V0IHRoZSBBcHBTeW5jIEdyYXBoUUwgZW5kcG9pbnQgdG8gdGhlIHRlcm1pbmFsXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJ0b2RvVVJMXCIsIHtcbiAgICAgIHZhbHVlOiBUb2RvYXBpLmdyYXBocWxVcmxcbiAgICB9KTtcblxuICAgIC8vIFByaW50cyBvdXQgdGhlIEFwcFN5bmMgR3JhcGhRTCBBUEkga2V5IHRvIHRoZSB0ZXJtaW5hbFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVG9kb0FwaUtleVwiLCB7XG4gICAgICB2YWx1ZTogVG9kb2FwaS5hcGlLZXkgfHwgJydcbiAgICB9KTtcblxuICAgIC8vIFByaW50cyBvdXQgdGhlIEFwcFN5bmMgQXBpIHRvIHRoZSB0ZXJtaW5hbFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVG9kb0FQSUlEXCIsIHtcbiAgICAgIHZhbHVlOiBUb2RvYXBpLmFwaUlkIHx8ICcnXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgbmV3IER5bmFtb0RCIFRhYmxlIGZvciBUb2Rvc1xuICAgIGNvbnN0IFRvZG9BcHBUYWJsZSA9IG5ldyBkeW5hbW9EQi5UYWJsZSh0aGlzLCAnVG9kQXBwVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiVG9kb1RhYmxlXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vREIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgYXMgYSBEYXRhc291cmNlIGZvciB0aGUgR3JhcGhxbCBBUEkuXG4gICAgY29uc3QgVG9kb0FwcERTID0gVG9kb2FwaS5hZGREeW5hbW9EYkRhdGFTb3VyY2UoJ1RvZG9BcHBEYXRhU291cmNlJywgVG9kb0FwcFRhYmxlKTtcblxuICAgIC8vIEhUVFAgYXMgRGF0YXNvdXJjZSBmb3IgdGhlIEdyYXBocWwgQVBJXG4gICAgY29uc3QgaHR0cEV2ZW50VHJpZ2dlckRTID0gVG9kb2FwaS5hZGRIdHRwRGF0YVNvdXJjZShcbiAgICAgIFwiZXZlbnRUcmlnZ2VyRFNcIixcbiAgICAgIFwiaHR0cHM6Ly9ldmVudHMuXCIgKyB0aGlzLnJlZ2lvbiArIFwiLmFtYXpvbmF3cy5jb20vXCIsIC8vIFRoaXMgaXMgdGhlIEVORFBPSU5UIGZvciBldmVudGJyaWRnZS5cbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJodHRwRHNXaXRoRXZlbnRCcmlkZ2VcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiRnJvbSBBcHBzeW5jIHRvIEV2ZW50YnJpZGdlXCIsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBzaWduaW5nUmVnaW9uOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgICBzaWduaW5nU2VydmljZU5hbWU6IFwiZXZlbnRzXCIsXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcbiAgICBldmVudHMuRXZlbnRCdXMuZ3JhbnRQdXRFdmVudHMoaHR0cEV2ZW50VHJpZ2dlckRTKTtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLyBDcmVhdGluZyBMYW1iZGEgaGFuZGxlciAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvKiBsYW1iZGEgMSAqL1xuICAgIGNvbnN0IGR5bmFtb0hhbmRsZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEeW5hbW9fSGFuZGxlcicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhJyksXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgIGhhbmRsZXI6ICdkeW5hbW9IYW5kbGVyLmhhbmRsZXInLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRFlOQU1PX1RBQkxFX05BTUU6IFRvZG9BcHBUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIC8vIEdpdmluZyBUYWJsZSBhY2Nlc3MgdG8gZHluYW1vSGFuZGxlckxhbWJkYVxuICAgIFRvZG9BcHBUYWJsZS5ncmFudEZ1bGxBY2Nlc3MoZHluYW1vSGFuZGxlckxhbWJkYSk7XG5cbiAgICBUb2RvQXBwRFMuY3JlYXRlUmVzb2x2ZXIoe1xuICAgICAgdHlwZU5hbWU6IFwiUXVlcnlcIixcbiAgICAgIGZpZWxkTmFtZTogJ2dldFRvZG9zJyxcbiAgICAgIHJlcXVlc3RNYXBwaW5nVGVtcGxhdGU6IGFwcHN5bmMuTWFwcGluZ1RlbXBsYXRlLmR5bmFtb0RiU2NhblRhYmxlKCksXG4gICAgICByZXNwb25zZU1hcHBpbmdUZW1wbGF0ZTogYXBwc3luYy5NYXBwaW5nVGVtcGxhdGUuZHluYW1vRGJSZXN1bHRMaXN0KCksXG4gICAgfSk7XG5cbiAgICAvKiBNdXRhdGlvbiAqL1xuICAgIGNvbnN0IG11dGF0aW9ucyA9IFtcImFkZFRvZG9cIiwgXCJkZWxldGVUb2RvXCIsXVxuICAgIG11dGF0aW9ucy5mb3JFYWNoKChtdXQpID0+IHtcbiAgICAgIGxldCBkZXRhaWxzID0gYFxcXFxcXFwidG9kb0lkXFxcXFxcXCI6IFxcXFxcXFwiJGN0eC5hcmdzLnRvZG9JZFxcXFxcXFwiYDtcbiAgICAgIGlmIChtdXQgPT09ICdhZGRUb2RvJykge1xuICAgICAgICBkZXRhaWxzID0gYFxcXFxcXFwidGl0bGVcXFxcXFxcIjpcXFxcXFxcIiRjdHguYXJncy50b2RvLnRpdGxlXFxcXFxcXCIgLCBcXFxcXFxcInVzZXJcXFxcXFxcIjpcXFxcXFxcIiRjdHguYXJncy50b2RvLnVzZXJcXFxcXFxcImBcbiAgICAgIH0gZWxzZSBpZiAobXV0ID09PSBcImRlbGV0ZVRvZG9cIikge1xuICAgICAgICBkZXRhaWxzID0gYFxcXFxcXFwidG9kb0lkXFxcXFxcXCI6XFxcXFxcXCIkY3R4LmFyZ3MudG9kb0lkXFxcXFxcXCJgXG4gICAgICB9XG4gICAgICBodHRwRXZlbnRUcmlnZ2VyRFMuY3JlYXRlUmVzb2x2ZXIoe1xuICAgICAgICB0eXBlTmFtZTogXCJNdXRhdGlvblwiLFxuICAgICAgICBmaWVsZE5hbWU6IG11dCxcbiAgICAgICAgcmVxdWVzdE1hcHBpbmdUZW1wbGF0ZTogYXBwc3luYy5NYXBwaW5nVGVtcGxhdGUuZnJvbVN0cmluZyhyZXF1ZXN0VGVtcGxhdGUoZGV0YWlscywgbXV0KSksXG4gICAgICAgIHJlc3BvbnNlTWFwcGluZ1RlbXBsYXRlOiBhcHBzeW5jLk1hcHBpbmdUZW1wbGF0ZS5mcm9tU3RyaW5nKHJlc3BvbnNlVGVtcGxhdGUoKSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vLy8vLy8vLy8gQ3JlYXRpbmcgcnVsZSB0byBpbnZva2Ugc3RlcCBmdW5jdGlvbiBvbiBldmVudCAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIG5ldyBldmVudHMuUnVsZSh0aGlzLCBcImV2ZW50Q29uc3VtZXJSdWxlXCIsIHtcbiAgICAgIGV2ZW50UGF0dGVybjoge1xuICAgICAgICBzb3VyY2U6IFtFVkVOVF9TT1VSQ0VdLFxuICAgICAgfSxcbiAgICAgIHRhcmdldHM6IFtuZXcgZXZlbnRzVGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihkeW5hbW9IYW5kbGVyTGFtYmRhKV1cbiAgICB9KTtcblxuXG4gICAgLy9oZXJlIEkgZGVmaW5lIHMzIGJ1Y2tldCBcbiAgICBjb25zdCB0b2Rvc0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJ0b2Rvc0J1Y2tldFwiLCB7XG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICB0b2Rvc0J1Y2tldC5ncmFudFB1YmxpY0FjY2VzcygpOyAvLyB3ZWJzaXRlIHZpc2libGUgdG8gYWxsLlxuXG4gICAgLy8gY3JlYXRlIGEgQ0ROIHRvIGRlcGxveSB5b3VyIHdlYnNpdGVcbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgXCJUb2Rvc0Rpc3RyaWJ1dGlvblwiLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbih0b2Rvc0J1Y2tldCksXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6IFwiaW5kZXguaHRtbFwiLFxuICAgIH0pO1xuXG5cbiAgICAvLyBQcmludHMgb3V0IHRoZSB3ZWIgZW5kcG9pbnQgdG8gdGhlIHRlcm1pbmFsXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJEaXN0cmlidXRpb25Eb21haW5OYW1lXCIsIHtcbiAgICAgIHZhbHVlOiBkaXN0cmlidXRpb24uZG9tYWluTmFtZSxcbiAgICB9KTtcblxuXG4gICAgLy8gaG91c2VrZWVwaW5nIGZvciB1cGxvYWRpbmcgdGhlIGRhdGEgaW4gYnVja2V0IFxuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsIFwiRGVwbG95VG9kb0FwcFwiLCB7XG4gICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmFzc2V0KFwiLi4vdG9kby1mcm9udGVuZC9wdWJsaWNcIildLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHRvZG9zQnVja2V0LFxuICAgICAgZGlzdHJpYnV0aW9uLFxuICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6IFtcIi8qXCJdLFxuICAgIH0pO1xuICB9XG59Il19