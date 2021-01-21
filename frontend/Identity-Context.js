import React,{useState,useEffect} from 'react';
import { Auth, Hub } from "aws-amplify";

export const IdentityContext = React.createContext({});


const IdentityProvider = props => {
  const [user, setUser] = useState(null)

  useEffect(() => {
    Hub.listen("auth", ({ payload: { event } }) => {
      switch (event) {
        case "signIn":
        case "cognitoHostedUI":
          getUser().then(userData => setUser(userData))
          break
        case "signOut":
          setUser(null)
          break
        case "signIn_failure":
        case "cognitoHostedUI_failure":
          break
          default:
            console.log('something went wrong')
      }
    })

    getUser().then(userData => {
      setUser(userData)
      console.log("Signed In:", userData)
    })
  }, [])

  function getUser() {
    return Auth.currentAuthenticatedUser()
      .then(userData => userData)
      .catch(() => console.log("Not signed in"))
  }


  return (
    <IdentityContext.Provider value={{ user }}>
      {props.children}
    </IdentityContext.Provider>
  )
};

export default IdentityProvider;