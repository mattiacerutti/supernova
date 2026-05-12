import {RouterProvider} from "@tanstack/react-router";
import type {AppEnvironment} from "@/app/app-environment";
import {router} from "@/app/router";

interface AppProps {
  appEnvironment?: AppEnvironment;
}

export default function App(props: AppProps) {
  const {appEnvironment = "web"} = props;

  return <RouterProvider context={{appEnvironment}} router={router} />;
}
