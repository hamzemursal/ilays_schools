"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";

export default function StudentChangePasswordPage() {
  return (
    <div>
      <PageHeader eyebrow="Student Portal" title="Change Password" description="Update your account password." />

      <div className="p-4 sm:p-6">
        <Card className="max-w-md">
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
