import { notFound } from "next/navigation";
import { ProjectsReimagined } from "./ProjectsReimagined";

/* Prototype — the Projects tab, reimagined.
   Spec: docs/specs/projects/projects-tab-one-definition-of-late.md */

export const metadata = { title: "Prototype · Projects" };

export default function ScratchProjectsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProjectsReimagined />;
}
