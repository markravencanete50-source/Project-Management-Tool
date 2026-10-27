// STARTING DRAFT ONLY. This agreement is a plain starting point and has not been
// reviewed by a lawyer. Review and adapt it (especially liability, intellectual
// property, termination and governing law) before using it with real clients.
//
// Format: the first line is the title. Lines such as "1. Parties" are rendered as
// section headings. Lines starting with "- " are bullets. {{placeholders}} are
// filled from the project when an agreement is created. A placeholder with no
// value stays visible as [missing: name] and blocks the agreement from being created.
//
// Available placeholders: businessName, businessEmail, clientName, clientCompany,
// clientEmail, projectTitle, scope, price, currency, paymentSchedule,
// revisionAllowance, startDate, deadline, agreementDate, governingLaw.

export const DEFAULT_AGREEMENT_TEMPLATE = `WEB DEVELOPMENT SERVICE AGREEMENT

This agreement is made on {{agreementDate}} and covers the project "{{projectTitle}}".

1. Parties

1.1 The Developer is {{businessName}}, contact email {{businessEmail}} (the "Developer").
1.2 The Client is {{clientName}}, of {{clientCompany}}, contact email {{clientEmail}} (the "Client").
1.3 Together they are the "Parties" and each is a "Party".

2. Scope of Work

2.1 The Developer will design, build and deliver the following work (the "Services"):

{{scope}}

2.2 Anything not described above is outside the Services. Additional work needs the written agreement of both Parties and may be charged separately.

3. Timeline

3.1 Work is planned to start on {{startDate}} and to be delivered by {{deadline}}.
3.2 These dates are targets. They depend on the Client providing the content, feedback and approvals described in section 6 on time. Delays caused by the Client move the dates by the same amount.

4. Fees and Payment Schedule

4.1 The total fee for the Services is {{price}} ({{currency}}).
4.2 The fee is payable as follows:

{{paymentSchedule}}

4.3 Payment is made directly to the Developer by bank transfer, PayPal, Wise, GCash or another method agreed in writing. The Developer records each payment received in the project tracker.
4.4 Amounts are in {{currency}}. Any bank or transfer charges are paid by the Client.
4.5 The Developer may pause work while an invoiced or scheduled amount is overdue.

5. Revisions

5.1 The fee includes {{revisionAllowance}} round(s) of revisions. A round is one consolidated set of change requests sent by the Client after a delivery.
5.2 Further rounds are extra work. The Developer will quote a price for each extra round, and the work starts only after the Client approves that quote. An approved quote is added to the fee and to the payment schedule as a change order.
5.3 Requests that change the agreed scope are not revisions. They are handled as described in section 2.2.

6. Client Responsibilities

The Client will:
- provide text, images, logos, accounts and other materials needed for the Services in a usable format and on time;
- give feedback and approvals within a reasonable time, normally within five working days;
- confirm that they own or have permission to use all materials they provide; and
- pay the fees on the dates set out in section 4.

7. Intellectual Property

7.1 Ownership of the final deliverables transfers to the Client once the full fee, including any approved change orders, has been paid.
7.2 Until then the Developer keeps ownership and grants the Client a limited licence to review the work.
7.3 The Developer keeps ownership of its general tools, code libraries, know-how and pre-existing materials, and grants the Client a non-exclusive, perpetual licence to use any of these that are included in the deliverables.
7.4 The Client keeps ownership of the materials it provides. The Developer may describe the project in its portfolio unless the Client asks in writing that it does not.

8. Confidentiality

8.1 Each Party will keep the other's non-public business, technical and financial information confidential, use it only for this project, and not share it with anyone except people who need it to deliver the Services and are bound to keep it confidential.
8.2 This section does not apply to information that is public through no fault of the receiving Party, or that must be disclosed by law.
8.3 This section continues to apply after the agreement ends.

9. Termination

9.1 Either Party may end this agreement by giving the other seven days' written notice.
9.2 Either Party may end it immediately in writing if the other Party seriously breaches it and does not fix the problem within seven days of being told.
9.3 On termination the Client pays for all work done up to the termination date, including a fair share of any milestone in progress, and any amounts already due. Amounts already paid are not refundable for work already carried out.
9.4 Sections 7, 8, 10 and 12 continue after termination.

10. Limitation of Liability

10.1 The Developer provides the Services with reasonable skill and care but does not promise that the deliverables will be free of errors or will run without interruption.
10.2 To the extent the law allows, the Developer is not liable for indirect or consequential loss, including lost profit, lost revenue, lost data or loss of business opportunity.
10.3 To the extent the law allows, the Developer's total liability under this agreement is limited to the fees the Client has paid for the Services.
10.4 Nothing in this agreement limits liability that cannot be limited by law.

11. Electronic Signature

11.1 The Parties agree that this agreement may be signed electronically, and that a typed name together with a drawn signature, recorded with the date, time, IP address and device details of the signer, is a valid and binding signature.
11.2 The signed copy, with its audit trail page, is the record of the agreement. A copy is emailed to both Parties.
11.3 This agreement is not binding on the Developer or the Client until the Client has signed it.

12. Governing Law

12.1 This agreement is governed by the laws of {{governingLaw}}.
12.2 The Parties will try to settle any dispute in good faith first. If that fails, the courts of that place have jurisdiction.

This agreement is the whole agreement between the Parties about the Services. Any change must be in writing and agreed by both Parties.
`;
