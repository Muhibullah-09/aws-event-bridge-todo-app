"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const AWS = require("aws-sdk");
const dynamoClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMO_TABLE_NAME || '';
exports.handler = async (event, context) => {
    console.log(JSON.stringify(event, null, 2));
    try {
        //////////////  add Todo /////////////////////////
        if (event["detail-type"] === "addTodo") {
            // console.log("detail===>", JSON.stringify(event.detail, null, 2));
            const params = {
                TableName: TABLE_NAME,
                Item: { id: 'mk' + Math.random(), ...event.detail },
            };
            await dynamoClient.put(params).promise();
        }
        //////////////  deleting todo /////////////////////////
        else if (event["detail-type"] === "deleteTodo") {
            // console.log("detail===>", JSON.stringify(event.detail, null, 2));
            const params = {
                TableName: TABLE_NAME,
                Key: { id: event.detail.id },
            };
            await dynamoClient.delete(params).promise();
        }
    }
    catch (error) {
        console.log('Error', error);
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImR5bmFtb0hhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEsK0JBQStCO0FBRS9CLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUN2RCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLEVBQUUsQ0FBQztBQUUxQyxRQUFBLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBb0MsRUFBRSxPQUFnQixFQUFFLEVBQUU7SUFDcEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QyxJQUFJO1FBQ0Esa0RBQWtEO1FBQ2xELElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLFNBQVMsRUFBRTtZQUNwQyxvRUFBb0U7WUFDcEUsTUFBTSxNQUFNLEdBQUc7Z0JBQ1gsU0FBUyxFQUFFLFVBQVU7Z0JBQ3JCLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBQzthQUNyRCxDQUFBO1lBQ0QsTUFBTSxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQzVDO1FBRUQsdURBQXVEO2FBQ2xELElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLFlBQVksRUFBRTtZQUM1QyxvRUFBb0U7WUFDcEUsTUFBTSxNQUFNLEdBQUc7Z0JBQ1gsU0FBUyxFQUFFLFVBQVU7Z0JBQ3JCLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRTthQUMvQixDQUFBO1lBQ0QsTUFBTSxZQUFZLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQy9DO0tBQ0o7SUFDRCxPQUFPLEtBQUssRUFBRTtRQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFBO0tBQzlCO0FBQ0wsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRCcmlkZ2VFdmVudCwgQ29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgKiBhcyBBV1MgZnJvbSAnYXdzLXNkayc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBBV1MuRHluYW1vREIuRG9jdW1lbnRDbGllbnQoKTtcbmNvbnN0IFRBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5EWU5BTU9fVEFCTEVfTkFNRSB8fCAnJztcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEV2ZW50QnJpZGdlRXZlbnQ8c3RyaW5nLCBhbnk+LCBjb250ZXh0OiBDb250ZXh0KSA9PiB7XG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgICB0cnkge1xuICAgICAgICAvLy8vLy8vLy8vLy8vLyAgYWRkIFRvZG8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICBpZiAoZXZlbnRbXCJkZXRhaWwtdHlwZVwiXSA9PT0gXCJhZGRUb2RvXCIpIHtcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZGV0YWlsPT09PlwiLCBKU09OLnN0cmluZ2lmeShldmVudC5kZXRhaWwsIG51bGwsIDIpKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgICAgICAgICAgSXRlbTogeyBpZDogJ21rJyArIE1hdGgucmFuZG9tKCksIC4uLmV2ZW50LmRldGFpbH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBkeW5hbW9DbGllbnQucHV0KHBhcmFtcykucHJvbWlzZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8vLy8vLy8vLy8vLy8gIGRlbGV0aW5nIHRvZG8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICBlbHNlIGlmIChldmVudFtcImRldGFpbC10eXBlXCJdID09PSBcImRlbGV0ZVRvZG9cIikge1xuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJkZXRhaWw9PT0+XCIsIEpTT04uc3RyaW5naWZ5KGV2ZW50LmRldGFpbCwgbnVsbCwgMikpO1xuICAgICAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgICAgICAgIFRhYmxlTmFtZTogVEFCTEVfTkFNRSxcbiAgICAgICAgICAgICAgICBLZXk6IHsgaWQ6IGV2ZW50LmRldGFpbC5pZCB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgZHluYW1vQ2xpZW50LmRlbGV0ZShwYXJhbXMpLnByb21pc2UoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0Vycm9yJywgZXJyb3IpXG4gICAgfVxufSJdfQ==