import {RouterProvider} from "@tanstack/react-router";
import {router} from "@/app/router";

interface IAppProps {
  integratedTitleBar?: boolean;
}

export default function App(props: IAppProps) {
  const {integratedTitleBar = false} = props;

  return <RouterProvider context={{integratedTitleBar}} router={router} />;
}
