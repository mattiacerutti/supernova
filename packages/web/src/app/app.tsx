import {RouterProvider} from "@tanstack/react-router";
import type {AppEnvironment} from "@/lib/app-environment";
import {router} from "@/app/router";
import {useConfiguration} from "@/features/configuration/hooks/api/use-configuration";

interface AppProps {
  appEnvironment: AppEnvironment;
}

export default function App(props: AppProps) {
  const {appEnvironment} = props;
  useConfiguration();

  return <RouterProvider context={{appEnvironment}} router={router} />;
}
