import React, { useContext } from "react";
import { Flex, NavLink } from "theme-ui";
import { Link } from "gatsby";
import { IdentityContext } from "../../Identity-Context";
import { Auth} from "aws-amplify";

const Navbar = () => {
  const { user } = useContext(IdentityContext);
  return (
    <Flex as="nav">
      <NavLink as={Link} to="/" p={2}>
        Home
      </NavLink>
      {user && <NavLink as={Link} to="/app" p={2}>Dashboard</NavLink>}
      {user && (
        <NavLink  sx={{ cursor: 'pointer' }} p={2} onClick={() => Auth.signOut()}>
          Logout {user.signInUserSession.idToken.payload.given_name}
        </NavLink>
      )}
    </Flex>
  );
};

export default Navbar;
