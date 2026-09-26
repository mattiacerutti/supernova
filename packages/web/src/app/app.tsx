import {RouterProvider} from "@tanstack/react-router";
import {router} from "@/app/router";
import {useConfiguration} from "@/api/configuration";

export default function App() {
  useConfiguration();

  return <RouterProvider router={router} />;
}
