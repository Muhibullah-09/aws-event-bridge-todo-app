/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type TodoInput = {
  title: string,
  user: string,
};

export type AddTodoMutationVariables = {
  todo: TodoInput,
};

export type AddTodoMutation = {
  addTodo:  {
    __typename: "Event",
    result: string | null,
  } | null,
};

export type DeleteTodoMutationVariables = {
  todoId: string,
};

export type DeleteTodoMutation = {
  deleteTodo:  {
    __typename: "Event",
    result: string | null,
  } | null,
};

export type GetTodosQuery = {
  getTodos:  Array< {
    __typename: "Todo",
    id: string,
    title: string,
    user: string,
  } > | null,
};
