import babelTemplate from "@babel/template";
import { connect } from "./lib.ts";
import { writeFile } from "node:fs/promises";
import t from "@babel/types";
import babelGenerate from "@babel/generator";
import {
  HassEntities,
  HassServices,
  subscribeEntities,
  subscribeServices,
} from "home-assistant-js-websocket";

const outTemplate = babelTemplate.program(
  `
%%entityTypeDeclaration%%

%%serviceTypeDeclaration%%

import { createRuntime } from "./lib.ts";

export default createRuntime<Entities, Services>();
`,
  { plugins: ["typescript"] },
);

export async function generate(output: string) {
  const conn = await connect();
  // Get events and services

  const [entities, services] = await Promise.all([
    new Promise<HassEntities>((resolve) => {
      const remove = subscribeEntities(conn, (state) => {
        resolve(state);
        remove();
      });
    }),
    new Promise<HassServices>((resolve) => {
      const remove = subscribeServices(conn, (state) => {
        resolve(state);
        remove();
      });
    }),
  ]);

  conn.close();

  const entityTypeDeclaration = t.typeAlias(
    t.identifier("Entities"),
    null,
    t.objectTypeAnnotation(
      Object.keys(entities).map((entityId) => {
        const entity = entities[entityId];
        return t.objectTypeProperty(
          t.stringLiteral(entityId),
          t.objectTypeAnnotation([
            t.objectTypeProperty(
              t.identifier("state"),
              t.stringTypeAnnotation(),
            ),

            t.objectTypeProperty(
              t.identifier("attributes"),
              t.objectTypeAnnotation(
                Object.keys(entity.attributes).map((attributeId) => {
                  return t.objectTypeProperty(
                    t.stringLiteral(attributeId),
                    t.stringTypeAnnotation(),
                  );
                }),
              ),
            ),
          ]),
        );
      }),
    ),
  );

  const serviceTypeDeclaration = t.typeAlias(
    t.identifier("Services"),
    null,
    t.objectTypeAnnotation(
      Object.keys(services).map((domainId) => {
        const domain = services[domainId];
        return t.objectTypeProperty(
          t.stringLiteral(domainId),
          t.objectTypeAnnotation(
            Object.keys(domain).map((serviceId) => {
              const service = domain[serviceId];
              return t.objectTypeProperty(
                t.stringLiteral(serviceId),
                t.objectTypeAnnotation([
                  t.objectTypeProperty(
                    t.identifier("fields"),
                    t.objectTypeAnnotation(
                      Object.keys(service.fields).map(
                        (fieldId) => {
                          const field = service.fields[fieldId];
                          return {
                            ...t.objectTypeProperty(
                              t.stringLiteral(fieldId),
                              t.stringTypeAnnotation(),
                            ),
                            optional: !field.required,
                          };
                        },
                      ),
                    ),
                  ),
                ]),
              );
            }),
          ),
        );
      }),
    ),
  );

  const out = outTemplate({
    entityTypeDeclaration,
    serviceTypeDeclaration,
  });

  await writeFile(output, (await babelGenerate.default(out)).code);
}

if (import.meta.main) {
  generate("autogen.ts");
}
