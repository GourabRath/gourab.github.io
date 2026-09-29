
async function test() {
  try {
    const res = await fetch("http://localhost:4000/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation Login($email: String!, $password: String!, $role: String!) {
            login(email: $email, password: $password, role: $role) {
              token
              user { id email role }
            }
          }
        `,
        variables: { email: "asha@example.com", password: "Password123!", role: "patient" }
      })
    });
    const text = await res.text();
    console.log(text);
  } catch(e) {
    console.error(e);
  }
}
test();
