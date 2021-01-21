import React, { useState, useRef, useEffect, useContext } from "react";
import { Router } from "@reach/router";
import { addTodo } from "../graphql/mutations";
import { getTodos } from "../graphql/queries";
import { deleteTodo } from "../graphql/mutations";
import { API } from "aws-amplify";
import { IdentityContext } from "../../Identity-Context";
import Navbar from "../components/Navbar";
import { Link } from 'gatsby';
import { Button, Heading, Input, Label, NavLink, Text } from "theme-ui";

const Dash = () => {
    const { user } = useContext(IdentityContext);
    const [loading, setLoading] = useState(true)
    const [todoData, setTodoData] = useState(null)
    const todoTitleRef = useRef("")

    const addTodoMutation = async () => {
        try {
            const todo = {
                title: todoTitleRef.current.value,
                user: user.username
            }
            await API.graphql({
                query: addTodo,
                variables: {
                    todo: todo,
                },
            })
            todoTitleRef.current.value = ""
            fetchTodos();
        } catch (e) {
            console.log(e)
        }
    }

    const fetchTodos = async () => {
        try {
            const data = await API.graphql({
                query: getTodos,
            })
            setTodoData(data);
            console.log(data);
            setLoading(false)
        } catch (e) {
            console.log(e)
        }
    }
    useEffect(() => {
        fetchTodos()
    }, [])
    return (
        <div>
            {loading ? (
                <Heading as="h3" sx={{ textAlign: "center" }}>Loading...</Heading>
            ) : (
                    <div>
                        <Navbar /><br /><br />
                        <Heading as="h3" sx={{ textAlign: "center" }}>Make Schedule Easy</Heading>
                        <Label>
                            <Input ref={todoTitleRef} />
                        </Label><br />
                        <Button sx={{ color: "black", textAlign: "center" }} onClick={() => addTodoMutation()}>Create Todo</Button><br /><br />
                        <Heading as="h2" sx={{ textAlign: "center" }}>Your Todo List</Heading>
                        {todoData.data &&
                            todoData.data.getTodos.filter((todo) => todo.user === user.username).map((item, ind) => (
                            // todoData.data.getTodos.map((item, ind) => (
                                <div style={{ marginLeft: "1rem", marginTop: "2rem" }} key={ind}>
                                    <Text sx={{ fontSize: 4, fontWeight: 'italic', margin: '5px'}}>{item.title}</Text>
                                    <div>
                                        <Button
                                            sx={{ color: "black", textAlign: "center" }}
                                            onClick={async e => {
                                                e.preventDefault();
                                                await API.graphql({
                                                    query: deleteTodo,
                                                    variables: { todoId: item.id },
                                                })
                                                fetchTodos();
                                            }}
                                        >Delete Todo</Button>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
        </div>
    );
};

const App = () => {
    const { user } = useContext(IdentityContext);
    return (
        <>
            <Router>{user && <Dash path="/app" />}</Router>
            {!user && <NavLink as={Link} to="/" p={2}>Home</NavLink>}
        </>)
};

export default App;