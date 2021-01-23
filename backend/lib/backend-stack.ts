import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as appsync from '@aws-cdk/aws-appsync';
import * as events from '@aws-cdk/aws-events';
import * as eventsTargets from '@aws-cdk/aws-events-targets';
import * as dynamoDB from '@aws-cdk/aws-dynamodb';
import * as cognito from '@aws-cdk/aws-cognito';
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";
import { requestTemplate, responseTemplate, EVENT_SOURCE } from '../utils/appsync-request-response';

export class BackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
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

    const provider = new cognito.UserPoolIdentityProviderGoogle(this, "googleProvider",
      {
        userPool: userPool,
        clientId: "946189751283-qar9hmgh34n2k95g99bj5t21q92u612u.apps.googleusercontent.com",
        clientSecret: "vs2NiWOpk3qAdVpyS5RIdKZH", // Google Client Secret
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          phoneNumber: cognito.ProviderAttribute.GOOGLE_PHONE_NUMBERS,
        },
        scopes: ["profile", "email", "openid"],
      }
    );
    userPool.registerIdentityProvider(provider);
    const userPoolClient = new cognito.UserPoolClient(this, "todoamplifyClient", {
      userPool,
      oAuth: {
        callbackUrls: ["https:///"], // This is what user is allowed to be redirected to with the code upon signin. this can be a list of urls.
        logoutUrls: ["https:///"], // This is what user is allowed to be redirected to after signout. this can be a list of urls.
      },
    });

    const domain = userPool.addDomain("Todosdomain", {
      cognitoDomain: {
        domainPrefix: "muhib-todos", // SET YOUR OWN Domain PREFIX HERE
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
    const httpEventTriggerDS = Todoapi.addHttpDataSource(
      "eventTriggerDS",
      "https://events." + this.region + ".amazonaws.com/", // This is the ENDPOINT for eventbridge.
      {
        name: "httpDsWithEventBridge",
        description: "From Appsync to Eventbridge",
        authorizationConfig: {
          signingRegion: this.region,
          signingServiceName: "events",
        },
      }
    );


    /* Mutation */
    const mutations = ["addTodo", "deleteTodo",]
    mutations.forEach((mut) => {
      let details = `\\\"todoId\\\": \\\"$ctx.args.todoId\\\"`;
      if (mut === 'addTodo') {
        details = `\\\"title\\\":\\\"$ctx.args.todo.title\\\" , \\\"user\\\":\\\"$ctx.args.todo.user\\\"`
      } else if (mut === "deleteTodo") {
        details = `\\\"todoId\\\":\\\"$ctx.args.todoId\\\"`
      }
      httpEventTriggerDS.createResolver({
        typeName: "Mutation",
        fieldName: mut,
        requestMappingTemplate: appsync.MappingTemplate.fromString(requestTemplate(details, mut)),
        responseMappingTemplate: appsync.MappingTemplate.fromString(responseTemplate()),
      });
    });

    events.EventBus.grantPutEvents(httpEventTriggerDS);

    ////////// Creating rule to invoke step function on event ///////////////////////
    new events.Rule(this, "eventConsumerRule", {
      eventPattern: {
        source: [EVENT_SOURCE],
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