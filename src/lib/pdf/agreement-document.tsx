import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { AgreementBlock } from "@/lib/pdf/merge";
import { winAnsiSafe } from "@/lib/pdf/text";

// Server only: @react-pdf/renderer is used from server actions and route handlers
// (runtime nodejs), never from client components.

const styles = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.5, color: "#111111" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 17, textAlign: "center", marginBottom: 14 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 6, marginBottom: 4 },
  paragraph: { marginBottom: 3 },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 12 },
  bulletMark: { width: 12 },
  bulletText: { flex: 1 },
  spacer: { height: 6 },
  footer: { position: "absolute", bottom: 30, left: 56, right: 56, fontSize: 8.5, color: "#666666", flexDirection: "row", justifyContent: "space-between" },
});

function AgreementDocument({ title, footerLabel, blocks }: { title: string; footerLabel: string; blocks: AgreementBlock[] }) {
  return (
    <Document title={winAnsiSafe(title)} creator="Project Tracker" producer="Project Tracker">
      <Page size="A4" style={styles.page} wrap>
        {blocks.map((block, index) => {
          const text = winAnsiSafe(block.text);
          switch (block.kind) {
            case "title":
              return (
                <Text key={index} style={styles.title}>
                  {text}
                </Text>
              );
            case "heading":
              return (
                <Text key={index} style={styles.heading} minPresenceAhead={48}>
                  {text}
                </Text>
              );
            case "bullet":
              return (
                <View key={index} style={styles.bulletRow} wrap={false}>
                  <Text style={styles.bulletMark}>{"•"}</Text>
                  <Text style={styles.bulletText}>{text}</Text>
                </View>
              );
            case "spacer":
              return <View key={index} style={styles.spacer} />;
            default:
              return (
                <Text key={index} style={styles.paragraph}>
                  {text}
                </Text>
              );
          }
        })}
        <View fixed style={styles.footer}>
          <Text>{winAnsiSafe(footerLabel)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Render merged agreement blocks to a PDF buffer (A4, built-in Helvetica). */
export async function renderAgreementPdf(input: { title: string; footerLabel: string; blocks: AgreementBlock[] }): Promise<Buffer> {
  return renderToBuffer(<AgreementDocument {...input} />);
}
