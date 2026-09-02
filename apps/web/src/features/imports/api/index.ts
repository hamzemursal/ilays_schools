import { api } from "@/lib/api";

export const importsApi = {
  upload: api.uploadStudentsImport,
  list: api.listImportBatches,
  getOne: api.getImportBatch,
  resolveRow: api.resolveImportRow,
};

export const STUDENTS_IMPORT_TEMPLATE = [
  "firstName,lastName,dateOfBirth,sex,academicYear,className,sectionName,studentNumber,rollNumber,legacyStudentNumber,guardianFirstName,guardianLastName,guardianPhone,guardianEmail,guardianRelationship",
  "Amina,Warsame,2015-03-12,FEMALE,2027,Class 7,A,,,,Hassan,Warsame,0611234567,,FATHER",
].join("\r\n");

export function downloadImportTemplate() {
  const blob = new Blob([STUDENTS_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
