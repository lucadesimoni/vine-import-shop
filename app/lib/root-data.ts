import { useRouteLoaderData } from "react-router";
import type { RootData } from "~/root";

export const useRootData = () => useRouteLoaderData("root") as RootData;
