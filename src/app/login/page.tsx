import { LoginForm } from "./login-form";

const LINK_ERRORS: Record<string, string> = {
  link: "That sign-in link didn't work. It may have expired or already been used. Request a new one below.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const code = Array.isArray(error) ? error[0] : error;
  return <LoginForm linkError={code ? LINK_ERRORS[code] : undefined} />;
}
