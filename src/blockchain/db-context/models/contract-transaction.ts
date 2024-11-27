import crypto from "crypto";
import { Entity, Column, BeforeInsert } from "typeorm";
import "reflect-metadata";

@Entity("contracttransactions")
export class ContractTransaction {
  @Column()
  hash: string;
  @Column()
  contract: string;
  @Column()
  block: string;
  @Column()
  functionName: string;
  @Column()
  arguments: any[];
  @Column()
  sender: string;
  @Column()
  timestamp: number;
}
