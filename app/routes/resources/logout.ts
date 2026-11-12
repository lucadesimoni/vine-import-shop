import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { logout } from "~/.server/auth";

export const action = ({ request }: Route.ActionArgs) => logout(request);
export const loader = () => redirect("/");
