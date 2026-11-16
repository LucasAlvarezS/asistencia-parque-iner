// Núcleo del servidor MCP de solo lectura (ver supabase/migrations/0047_chat_mcp.sql).
// Todo el SQL corre con el rol `mcp_reader`: solo SELECT sobre vistas chat_*,
// transacción READ ONLY y statement_timeout. Las validaciones de aquí son una
// primera barrera; la segura es el rol.

import { Pool } from "pg";

const MAX_FILAS = 200;

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    const url = process.env.MCP_DATABASE_URL;
    if (!url) throw new Error("MCP_DATABASE_URL no configurada");
    pool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: { rejectUnauthorized: false }, // pooler de Supabase
    });
  }
  return pool;
}

/** Acepta un único SELECT (o WITH ... SELECT). Devuelve el SQL sin ';' final. */
export function validarSelect(sql: string): string {
  let s = sql.trim();
  while (s.endsWith(";")) s = s.slice(0, -1).trimEnd();
  if (!s) throw new Error("La consulta está vacía.");
  if (s.includes(";")) throw new Error("Solo se permite una sentencia.");
  if (/--|\/\*/.test(s)) throw new Error("No se permiten comentarios SQL.");
  if (!/^(select|with)\b/i.test(s)) throw new Error("Solo se permiten consultas SELECT.");
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|set|reset|vacuum|listen|notify)\b/i.test(s)) {
    throw new Error("La consulta contiene una palabra no permitida.");
  }
  return s;
}

export interface Resultado {
  filas: Record<string, unknown>[];
  truncado: boolean;
}

async function ejecutar(sql: string, params: unknown[] = []): Promise<Resultado> {
  const client = await getPool().connect();
  try {
    await client.query("begin read only");
    const r = await client.query(
      `select * from (${sql}) q limit ${MAX_FILAS + 1}`,
      params,
    );
    await client.query("rollback");
    const truncado = r.rows.length > MAX_FILAS;
    return { filas: truncado ? r.rows.slice(0, MAX_FILAS) : r.rows, truncado };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* conexión ya cerrada */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function consultarSql(sql: string): Promise<Resultado> {
  return ejecutar(validarSelect(sql));
}

// ---------------------------------------------------------------------
// Herramientas fijas (cifras que se entregan y deben salir siempre iguales)
// ---------------------------------------------------------------------

/** Resumen del día de VESTAS AR (misma lógica que resumen_arg, sobre las vistas chat_*). */
export async function resumenDia(fecha: string): Promise<Resultado> {
  return ejecutar(
    `with j as (
       select tecnico, subtipo, parque, bool_or(abierta) as jornada_abierta
       from chat_jornadas
       where fecha = $1::date and empresa_id = 'vestas_argentina'
       group by tecnico, subtipo, parque
     ),
     v as (
       select cv.tecnico, cv.subtipo, cv.parque,
              count(distinct cv.maquina_id) filter (where cv.dia_de_primera_inspeccion) as inspeccionadas,
              count(distinct cv.maquina_id) filter (
                where cv.visita_cerrada and cv.n_cavidades = 6
                  and tu.fecha_primera_inspeccion < cv.fecha) as reinspecciones
       from chat_visitas cv
       left join chat_turbinas tu
         on tu.parque_id = cv.parque_id and tu.maquina_id = cv.maquina_id and tu.subtipo = cv.subtipo
       where cv.fecha = $1::date and cv.empresa_id = 'vestas_argentina'
       group by cv.tecnico, cv.subtipo, cv.parque
     )
     select j.parque, j.tecnico, j.subtipo,
            coalesce(v.inspeccionadas, 0)::int as inspeccionadas,
            coalesce(v.reinspecciones, 0)::int as reinspecciones,
            j.jornada_abierta
     from j left join v using (tecnico, subtipo, parque)
     order by j.subtipo desc, j.tecnico, j.parque`,
    [fecha],
  );
}

/** Resumen FAC: semana lun-sáb que empieza en `lunes`. Solo VESTAS Argentina, sin Arauco. */
export async function resumenFac(lunes: string): Promise<Resultado> {
  return ejecutar(
    `with t as (
       select tu.parque_id, tu.parque, tu.subtipo, tu.fecha_primera_inspeccion as f
       from chat_turbinas tu
       where tu.empresa_id = 'vestas_argentina' and tu.parque_id not like 'ar\\_arauco%'
         and tu.completa and tu.fecha_primera_inspeccion is not null
     )
     select p.parque,
            t.subtipo,
            p.wtg_total,
            count(*) filter (where t.f <= $1::date + 5)::int                       as wtg_inspec,
            (p.wtg_total - count(*) filter (where t.f <= $1::date + 5))::int       as wtg_pend,
            count(*) filter (where t.f between $1::date - 7 and $1::date - 2)::int as wtg_semana_anterior,
            count(*) filter (where t.f = $1::date)::int       as lun,
            count(*) filter (where t.f = $1::date + 1)::int   as mar,
            count(*) filter (where t.f = $1::date + 2)::int   as mie,
            count(*) filter (where t.f = $1::date + 3)::int   as jue,
            count(*) filter (where t.f = $1::date + 4)::int   as vie,
            count(*) filter (where t.f = $1::date + 5)::int   as sab,
            count(*) filter (where t.f between $1::date and $1::date + 5)::int as total
     from t join chat_parques p using (parque_id)
     group by p.parque, t.subtipo, p.wtg_total
     having count(*) filter (where t.f between $1::date and $1::date + 5) > 0
     order by t.subtipo desc, p.parque`,
    [lunes],
  );
}

export async function describirEsquema(): Promise<string> {
  const r = await ejecutar(
    `select table_name as vista, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as columnas
     from information_schema.columns
     where table_schema = 'public' and table_name like 'chat\\_%'
     group by table_name order by table_name`,
  );
  const vistas = r.filas.map((f) => `- ${f.vista}: ${f.columnas}`).join("\n");
  return `${vistas}\n\n${GLOSARIO}`;
}

export const GLOSARIO = `REGLAS DE NEGOCIO (INER Check-in, parques eólicos)
- Solo consulta vistas chat_*. Horas *_arg = hora local de Argentina (sin zona). País va como 'argentina' (sin abreviar).
- Jornada = un técnico en un parque en un día. estado 'abierta' = el día aún no se cerró: los conteos son PARCIALES.
  Cierre = salida_parque (fin del día) o finalizar_parque (fin del parque). Antes de dar un conteo por definitivo, verifica que las jornadas del día estén cerradas.
- Turbina inspeccionada = 6/6 cavidades (A/B/C x TEC/LEC). En INTERNA una visita parcial NO suma; en EXTERNA un cierre de turbina trae las 6.
  Usa chat_turbinas (completa, fecha_primera_inspeccion) o chat_visitas.dia_de_primera_inspeccion. No reconstruyas esa lógica.
- Primera inspección vs reinspección: una reinspección es una turbina ya completa que se visita de nuevo; NO suma avance.
  Interna y externa se cuentan por separado (subtipo).
- Subtipo: 'interno' | 'inspector_externo'. Resúmenes Vestas Argentina: empresa_id = 'vestas_argentina', EXCLUYEN Arauco (parque_id 'ar_arauco%') y Chile.
- Standby: tramo inicio_standby hasta el evento siguiente (chat_standbys). Facturable (Siemens): clima, indisponibilidad de máquina o de técnico;
  NO facturable: pausas personales. El standby de reinspecciones no se factura. 'parece_clima' es solo una heurística: aclara que la facturabilidad requiere criterio.
- Predios: algunos parques comparten predio (Manantiales I y II); un técnico puede tener jornada en ambos el mismo día.
- Semana FAC: lunes a sábado. Los operadores sincronizan tarde: un día reciente puede cambiar. Si el corte es de hoy, dilo.
- Responde en español neutro, claro y breve; indica la fecha del corte y si el conteo es parcial.`;
