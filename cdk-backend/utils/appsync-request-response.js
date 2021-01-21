"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseTemplate = exports.requestTemplate = exports.EVENT_SOURCE = void 0;
exports.EVENT_SOURCE = "todo-app-events";
//////////////////   -------REQUEST-------    //////////////////
exports.requestTemplate = (detail, detailType) => {
    return `{
        "version": "2018-05-29",
        "method": "POST",
        "resourcePath": "/",
        "params": {
          "headers": {
            "content-type": "application/x-amz-json-1.1",
            "x-amz-target":"AWSEvents.PutEvents"
          },
          "body": {
            "Entries":[
              {
                "DetailType":"${detailType}",
                "Source":"${exports.EVENT_SOURCE}",
                "EventBusName": "default",
                "Detail": "{${detail}}"
              }
            ]
          }
        }
      }`;
};
//////////////////   -------RESPONSE-------    //////////////////
exports.responseTemplate = () => {
    return `
        #if($ctx.error)
        $util.error($ctx.error.message, $ctx.error.type)
        #end
        #if($ctx.result.statusCode == 200)
        {
            "result": "$util.parseJson($ctx.result.body)"
        }
        #else
        $utils.appendError($ctx.result.body, $ctx.result.statusCode)
        #end
    `;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwc3luYy1yZXF1ZXN0LXJlc3BvbnNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwc3luYy1yZXF1ZXN0LXJlc3BvbnNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFhLFFBQUEsWUFBWSxHQUFHLGlCQUFpQixDQUFDO0FBRTlDLGdFQUFnRTtBQUNuRCxRQUFBLGVBQWUsR0FBRyxDQUFDLE1BQWMsRUFBRSxVQUFrQixFQUFFLEVBQUU7SUFDbEUsT0FBTzs7Ozs7Ozs7Ozs7O2dDQVlxQixVQUFVOzRCQUNkLG9CQUFZOzs4QkFFVixNQUFNOzs7OztRQUs1QixDQUFBO0FBQ1IsQ0FBQyxDQUFBO0FBRUQsaUVBQWlFO0FBQ3BELFFBQUEsZ0JBQWdCLEdBQUcsR0FBRyxFQUFFO0lBQ2pDLE9BQU87Ozs7Ozs7Ozs7O0tBV04sQ0FBQTtBQUNMLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjb25zdCBFVkVOVF9TT1VSQ0UgPSBcInRvZG8tYXBwLWV2ZW50c1wiO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8gICAtLS0tLS0tUkVRVUVTVC0tLS0tLS0gICAgLy8vLy8vLy8vLy8vLy8vLy8vXG5leHBvcnQgY29uc3QgcmVxdWVzdFRlbXBsYXRlID0gKGRldGFpbDogc3RyaW5nLCBkZXRhaWxUeXBlOiBzdHJpbmcpID0+IHtcbiAgICByZXR1cm4gYHtcbiAgICAgICAgXCJ2ZXJzaW9uXCI6IFwiMjAxOC0wNS0yOVwiLFxuICAgICAgICBcIm1ldGhvZFwiOiBcIlBPU1RcIixcbiAgICAgICAgXCJyZXNvdXJjZVBhdGhcIjogXCIvXCIsXG4gICAgICAgIFwicGFyYW1zXCI6IHtcbiAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi94LWFtei1qc29uLTEuMVwiLFxuICAgICAgICAgICAgXCJ4LWFtei10YXJnZXRcIjpcIkFXU0V2ZW50cy5QdXRFdmVudHNcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJib2R5XCI6IHtcbiAgICAgICAgICAgIFwiRW50cmllc1wiOltcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiRGV0YWlsVHlwZVwiOlwiJHtkZXRhaWxUeXBlfVwiLFxuICAgICAgICAgICAgICAgIFwiU291cmNlXCI6XCIke0VWRU5UX1NPVVJDRX1cIixcbiAgICAgICAgICAgICAgICBcIkV2ZW50QnVzTmFtZVwiOiBcImRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICBcIkRldGFpbFwiOiBcInske2RldGFpbH19XCJcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfWBcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vICAgLS0tLS0tLVJFU1BPTlNFLS0tLS0tLSAgICAvLy8vLy8vLy8vLy8vLy8vLy9cbmV4cG9ydCBjb25zdCByZXNwb25zZVRlbXBsYXRlID0gKCkgPT4ge1xuICAgIHJldHVybiBgXG4gICAgICAgICNpZigkY3R4LmVycm9yKVxuICAgICAgICAkdXRpbC5lcnJvcigkY3R4LmVycm9yLm1lc3NhZ2UsICRjdHguZXJyb3IudHlwZSlcbiAgICAgICAgI2VuZFxuICAgICAgICAjaWYoJGN0eC5yZXN1bHQuc3RhdHVzQ29kZSA9PSAyMDApXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwicmVzdWx0XCI6IFwiJHV0aWwucGFyc2VKc29uKCRjdHgucmVzdWx0LmJvZHkpXCJcbiAgICAgICAgfVxuICAgICAgICAjZWxzZVxuICAgICAgICAkdXRpbHMuYXBwZW5kRXJyb3IoJGN0eC5yZXN1bHQuYm9keSwgJGN0eC5yZXN1bHQuc3RhdHVzQ29kZSlcbiAgICAgICAgI2VuZFxuICAgIGBcbn1cblxuIl19