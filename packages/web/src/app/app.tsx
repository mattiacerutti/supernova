import {RouterProvider} from "@tanstack/react-router";
import type {AppEnvironment} from "@/lib/app-environment";
import {router} from "@/app/router";

interface AppProps {
  appEnvironment: AppEnvironment;
}

export default function App(props: AppProps) {
  const {appEnvironment} = props;

  return <RouterProvider context={{appEnvironment}} router={router} />;
}
