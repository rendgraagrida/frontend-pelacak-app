<table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-3">Address</th>
                  <th className="pb-3">Network</th>
                  <th className="pb-3 text-right">Balance (Native)</th>
                </tr>
              </thead>
              <tbody>
                {wallets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      Belum ada wallet di watchlist.
                    </td>
                  </tr>
                ) : (
                  wallets.map((wallet: any, index: number) => (
                    <tr key={index} className="border-b border-gray-750 hover:bg-gray-750 transition-colors">
                      <td className="py-4 font-mono text-sm truncate max-w-[200px]" title={wallet.wallet_address}>
                        {wallet.wallet_address}
                      </td>
                      <td className="py-4 capitalize">
                        <span className="bg-gray-700 px-2 py-1 rounded text-xs font-semibold">
                          {wallet.chain_network}
                        </span>
                      </td>
                      <td className="py-4 text-right font-bold text-green-400">
                        {/* Menampilkan saldo live, potong desimal agar rapi */}
                        {wallet.balance === "Error RPC" 
                          ? <span className="text-red-400 text-xs">Error RPC</span> 
                          : wallet.balance 
                            ? parseFloat(wallet.balance).toFixed(4) 
                            : "0.0000"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>