import { jsPDF } from 'jspdf';
import type { CopyAnnotationPdfInput } from '../../ports/correctionWorkspace.ts';
import { isCopyAnnotationPlacement, copyAnnotationToneLabel } from '../../domain/copyAnnotationFeature.ts';

export function createCopyAnnotationPdf(input: CopyAnnotationPdfInput): Blob {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const margin = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const width = pageWidth - margin * 2;
  const lineHeight = 6;
  const notes = input.annotations.flatMap((annotation, index) => annotation.status === 'accepted'
    ? [{ ...annotation, number: index + 1, placement: isCopyAnnotationPlacement(annotation.placement)
      && annotation.placement.pageNumber <= input.images.length ? annotation.placement : undefined }]
    : []);

  let y = margin;
  const section = (title: string) => {
    if (y + 2 * lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(title, margin, y);
    y += lineHeight + 3;
  };
  const paragraph = (text: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    for (const line of pdf.splitTextToSize(text, width) as string[]) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += 3;
  };

  section('Correction de la copie');
  paragraph([input.assignmentTitle, input.studentLabel].filter(Boolean).join(' · '));
  const format = (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2, useGrouping: false });
  paragraph(`${input.finalized ? 'Note validée' : 'Note provisoire'} : ${format(input.score)} / ${format(input.maximum)}`);
  if (input.appreciation.trim()) {
    section('Appréciation générale');
    paragraph(input.appreciation.trim());
  }
  if (notes.length) {
    section('Annotations');
    for (const note of notes) paragraph(`${note.number}. ${note.tone ? copyAnnotationToneLabel(note.tone) + ' · ' : ''}${note.placement ? `Page ${note.placement.pageNumber} · ` : ''}${note.message}`);
  }

  input.images.forEach((image, index) => {
    const number = index + 1;
    pdf.addPage();
    const data = `data:${image.mimeType};base64,${image.base64}`;
    const dimensions = pdf.getImageProperties(data);
    const imageTop = margin + 8;
    const scale = Math.min(width / dimensions.width, (pageHeight - margin - imageTop) / dimensions.height);
    const imageWidth = dimensions.width * scale;
    const imageHeight = dimensions.height * scale;
    const left = (pageWidth - imageWidth) / 2;
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    pdf.text(`Copie · page ${number} / ${input.images.length}`, margin, margin);
    pdf.addImage(data, dimensions.fileType, left, imageTop, imageWidth, imageHeight, undefined, 'FAST');

    for (const note of notes) {
      const point = note.placement;
      if (point?.pageNumber !== number) continue;
      const x = left + imageWidth * point.x / 1000;
      const pinY = imageTop + imageHeight * point.y / 1000;
      pdf.setFillColor(255, 255, 255);
      const color: [number, number, number] = note.tone === 'positive' ? [39, 118, 75]
        : note.tone === 'improvement' ? [179, 49, 54] : [75, 85, 99];
      pdf.setDrawColor(...color);
      pdf.setTextColor(...color);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.circle(x, pinY, 2.5, 'FD');
      pdf.text(String(note.number), x, pinY, { align: 'center', baseline: 'middle' });
      if (note.tone) pdf.text(note.tone === 'positive' ? '+' : '!', x + (point.x > 500 ? -4 : 4), pinY, { align: 'center', baseline: 'middle' });
    }
  });
  return pdf.output('blob');
}
