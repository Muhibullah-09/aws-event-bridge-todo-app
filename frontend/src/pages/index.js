import React, { useContext } from "react";
import { Button, Container, Flex, Heading } from "theme-ui";
import { IdentityContext } from "../../Identity-Context";
import Navbar from "../components/Navbar";
import { Link } from "gatsby";
import { Auth } from "aws-amplify";

const Index = () => {
  const { user } = useContext(IdentityContext);
  return (
    <Container>
      <Navbar />
      <Flex sx={{ flexDirection: "column", padding: 3, textAlign: "center" }}>
        <Heading as="h1">Todo App</Heading>
        {!user && (
          <Button
            sx={{ marginTop: 2, color: 'black', fontFamily: 'monospace', cursor: 'pointer' }}
            onClick={() => {
              Auth.federatedSignIn({ provider: "Google"})
            }}
          >
            Login
          </Button>
        )}
        {user && (
            <Button sx={{ marginTop: 2, color: 'black', cursor: 'pointer' }}>
              <Link to='app/'>Create Todos</Link>
            </Button>
        )}
      </Flex>
    </Container>
  );
};

export default Index;