import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/admin/import-wizard";

export default function QuestionBankImportPage() {
  return (
    <div>
      <PageHeader
        title="Bulk import questions"
        description="Upload a CSV or JSON file, review the parsed questions, then confirm the import."
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/question-bank">
              <ArrowLeft className="h-4 w-4" /> Back to question bank
            </Link>
          </Button>
        }
      />
      <ImportWizard />
    </div>
  );
}
