import { EventBridgeEvent, Context } from 'aws-lambda';

import * as AWS from 'aws-sdk';

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMO_TABLE_NAME || '';

export const handler = async (event: EventBridgeEvent<string, any>, context: Context) => {
    console.log(JSON.stringify(event, null, 2));
    try {
        //////////////  add Todo /////////////////////////
        if (event["detail-type"] === "addTodo") {
            // console.log("detail===>", JSON.stringify(event.detail, null, 2));
            const params = {
                TableName: TABLE_NAME,
                Item: { id: 'mk' + Math.random(), ...event.detail},
            }
            await dynamoClient.put(params).promise();
        }

        //////////////  deleting todo /////////////////////////
        else if (event["detail-type"] === "deleteTodo") {
            // console.log("detail===>", JSON.stringify(event.detail, null, 2));
            const params = {
                TableName: TABLE_NAME,
                Key: { id: event.detail.todoId },
            }
            await dynamoClient.delete(params).promise();
        }
    }
    catch (error) {
        console.log('Error', error)
    }
}