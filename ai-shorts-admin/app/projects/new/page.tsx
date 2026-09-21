import ProjectForm from "@/components/ProjectForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Новий проєкт — AI Shorts Studio" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        backHref="/"
        eyebrow="projects · create"
        title="Новий проєкт"
        subtitle="Ніша, навколо якої збиратимуться тренди та теми."
      />
      <ProjectForm />
    </>
  );
}
